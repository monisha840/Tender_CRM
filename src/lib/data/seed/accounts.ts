import { addDays, DEMO_TODAY } from "@/lib/dates";
import { addMoney, percentOf, subMoney, sumMoney } from "@/lib/money";
import type { GstFilingStatus, InvoicePaymentStatus, InvoiceType, IsoDate, Money } from "@/types";
import { SITES } from "./catalog";
import { at, dayOffset, financialYear, meta, pad, rupees, type SeedCtx } from "./helpers";
import { GST_STATE_CODE, ORG_PAN } from "./org";
import { actualRupees, budgetRupees, CATEGORIES, contractRupees, monthsElapsed, splitRupees, type CategoryId } from "./plan";
import type { ProjectInfo } from "./projects";

/** Which state each of our GSTINs is registered in. */
const GST_STATE: Record<string, string> = { gst_cg: "st_cg", gst_mh: "st_mh", gst_tn: "st_tn", gst_dl: "st_dl" };
const GST_SHORT: Record<string, string> = { gst_cg: "CG", gst_mh: "MH", gst_tn: "TN", gst_dl: "DL" };
/** Projects whose older invoices are still unpaid, to produce overdue receivables. */
const UNPAID_OLDER = ["p2_cspgcl_paint", "p6_ntpc_steel"];

/** Demo customer GSTIN for a plant state: state code + organisation PAN + entity, Z and a check letter. */
function customerGstin(stateId: string, orgId: string): string {
  const body = `${GST_STATE_CODE[stateId]}${ORG_PAN[orgId]}1Z`;
  const check = String.fromCharCode(65 + (body.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 26));
  return body + check;
}

/** First 11th of the month after `date` (GSTR-1 style statutory filing due date). */
function filingDue(date: IsoDate): IsoDate {
  const [y, m] = date.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-11`;
}

interface Draft {
  project: ProjectInfo;
  index: number;
  fromNewest: number;
  count: number;
  invoiceDate: IsoDate;
  periodFrom: IsoDate;
  periodTo: IsoDate;
  taxable: number;
}

export function seedAccounts(ctx: SeedCtx, projects: ProjectInfo[]) {
  const { db, rng } = ctx;
  const today = DEMO_TODAY;
  const drafts: Draft[] = [];

  projects.forEach((proj) => {
    // ---- Budget lines ----
    CATEGORIES.forEach((cat) =>
      db.projectBudgetLines.push({ ...meta(`pbl_${proj.key}_${cat}`), projectId: proj.id, expenseCategoryId: cat, plannedAmount: rupees(budgetRupees(proj, cat)) }),
    );

    // ---- Labour / equipment / overheads actuals (monthly), topping up whatever bills already cover ----
    const months = monthsElapsed(proj);
    const cap = proj.endDate < today ? proj.endDate : addDays(today, -1);
    const monthDate = (k: number) => {
      const d = addDays(proj.startDate, 30 * (k + 1));
      return d > cap ? cap : d;
    };
    (["ec_labour", "ec_equipment", "ec_overheads"] as CategoryId[]).forEach((cat) => {
      const already = db.costEntries
        .filter((c) => c.projectId === proj.id && c.expenseCategoryId === cat && c.kind === "ACTUAL")
        .reduce((a, c) => a + Number(c.amount), 0);
      const remaining = Math.round(actualRupees(proj, cat) - already);
      if (remaining <= 0) return;
      splitRupees(remaining, months, rng.next, 0.3).forEach((amt, k) =>
        db.costEntries.push({
          ...meta(`ce_${cat}_${proj.key}_${k + 1}`), projectId: proj.id, siteId: proj.siteId, regionId: proj.regionId, expenseCategoryId: cat, kind: "ACTUAL",
          sourceType: cat === "ec_labour" ? "PAYROLL" : "EXPENSE", sourceId: `${cat}_${proj.key}_${k + 1}`, amount: rupees(amt), date: monthDate(k),
        }),
      );
    });

    // ---- Invoice drafts: monthly for service contracts, every ~60 days for fixed-scope jobs ----
    const monthly = proj.billing === "MONTHLY";
    const earliest = addDays(proj.startDate, 20);
    const dates: { date: IsoDate; from: IsoDate; to: IsoDate }[] = [];
    // Newest invoice: this month's for running projects, the month after the end for finished ones.
    const newestRef = proj.completed ? addDays(proj.endDate, 30) : today;
    for (let k = 0; k < (monthly ? 14 : 8); k++) {
      if (monthly) {
        const [ty, tm] = newestRef.split("-").map(Number);
        const idx = ty * 12 + (tm - 1) - k; // k = 0 → this month's invoice for last month
        const y = Math.floor(idx / 12);
        const m = (idx % 12) + 1;
        const date = `${y}-${String(m).padStart(2, "0")}-03`;
        const prev = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
        const lastDay = new Date(Date.UTC(prev.y, prev.m, 0)).getUTCDate();
        const from = `${prev.y}-${String(prev.m).padStart(2, "0")}-01`;
        const to = `${prev.y}-${String(prev.m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        if (date >= earliest && date <= newestRef && from >= proj.startDate.slice(0, 7) + "-01") dates.unshift({ date, from, to });
      } else {
        const date = addDays(proj.completed ? addDays(proj.endDate, 10) : dayOffset(-4), -60 * k);
        if (date >= earliest) dates.unshift({ date, from: addDays(date, -62), to: addDays(date, -3) });
      }
    }
    if (!dates.length) return;
    const billedTotal = Math.round(contractRupees(proj) * (proj.actualPct / 100) * (proj.completed ? 1 : 0.97));
    const parts = splitRupees(billedTotal, dates.length, rng.next, monthly ? 0.08 : 0.3);
    dates.forEach((d, i) =>
      drafts.push({ project: proj, index: i, fromNewest: dates.length - 1 - i, count: dates.length, invoiceDate: d.date, periodFrom: d.from, periodTo: d.to, taxable: parts[i] }),
    );
  });

  // ---- Number invoices in date order per GSTIN and financial year, then write them ----
  drafts.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.project.key.localeCompare(b.project.key));
  const counters = new Map<string, number>();
  const siteState = new Map(SITES.map((s) => [s.id, s.state]));

  drafts.forEach((d) => {
    const proj = d.project;
    const fy = financialYear(d.invoiceDate);
    const ck = `${proj.gstId}:${fy}`;
    const seq = (counters.get(ck) ?? 0) + 1;
    counters.set(ck, seq);
    const invoiceNo = `SPH/${GST_SHORT[proj.gstId]}/${fy}/${pad(seq, 4)}`;
    const id = `inv_${proj.key}_${d.index + 1}`;

    const taxable = rupees(d.taxable);
    const gst = percentOf(taxable, 18);
    const placeOfSupply = siteState.get(proj.siteId)!;
    const intra = GST_STATE[proj.gstId] === placeOfSupply;
    const half = percentOf(gst, 50);
    const cgst = intra ? half : "0.00";
    const sgst = intra ? subMoney(gst, half) : "0.00";
    const igst = intra ? "0.00" : gst;
    const total = addMoney(taxable, gst);

    const spec = db.projects.find((p) => p.id === proj.id)!;
    const deductions: [string, Money][] = [
      ["ded_tds_it", percentOf(taxable, 2)],
      ["ded_tds_gst", percentOf(taxable, 2)],
    ];
    if (spec.contractType === "FIXED_SCOPE") deductions.push(["ded_retention", percentOf(taxable, 5)]);
    if (proj.template === "civil" || proj.template === "steel" || proj.template === "package") deductions.push(["ded_cess", percentOf(taxable, 1)]);
    if (proj.key === "p2_cspgcl_paint" && d.fromNewest === 0) deductions.push(["ded_penalty", rupees(25000)]);
    if (proj.key === "p6_ntpc_steel" && d.fromNewest === 1) deductions.push(["ded_penalty", rupees(60000)]);
    const totalDed = sumMoney(deductions.map(([, a]) => a));
    const net = subMoney(total, totalDed);

    // Receipts: paid when the (slightly random) payment date has passed; a few projects pay late on purpose.
    const paidOn = addDays(d.invoiceDate, proj.paymentTermsDays + rng.int(-10, 8));
    let received: Money = paidOn < today && d.fromNewest >= 1 ? net : "0.00";
    if (d.fromNewest === 0 && !proj.completed) received = "0.00";
    if (proj.completed) received = net;
    if (UNPAID_OLDER.includes(proj.key) && d.fromNewest >= 1 && d.fromNewest <= 2) received = "0.00";
    if (proj.key === "p8_nalco_paint" && d.fromNewest === 2) received = percentOf(net, 50);
    const paymentStatus: InvoicePaymentStatus = received === "0.00" ? "UNPAID" : received === net ? "PAID" : "PARTLY_PAID";

    // GST filing: due on the 11th of the following month; filed once that date has passed (one deliberate miss).
    const filingDueDate = filingDue(d.invoiceDate);
    const missed = proj.key === "p6_ntpc_steel" && d.fromNewest === 1;
    const filed = filingDueDate < today && !missed;
    const gstFilingStatus: GstFilingStatus = filed ? "FILED" : "PENDING";
    const fm = filingDueDate.slice(5, 7);
    const fyShort = filingDueDate.slice(2, 4);
    const filingReference = filed ? `AA${fm}${fyShort}${rng.int(100000000, 999999999)}` : null;
    const invoiceType: InvoiceType = proj.billing === "MONTHLY" ? "MONTHLY" : "MILESTONE";

    db.invoices.push({
      ...meta(id, at(d.invoiceDate)), gstRegistrationId: proj.gstId, invoiceNo, invoiceDate: d.invoiceDate, organisationId: proj.organisationId,
      customerGstin: customerGstin(placeOfSupply, proj.organisationId), projectId: proj.id, regionId: proj.regionId, invoiceType, periodFrom: d.periodFrom, periodTo: d.periodTo,
      taxableValue: taxable, cgst, sgst, igst, total, totalDeductions: totalDed, netReceivable: net, receivedAmount: received,
      dueDate: addDays(d.invoiceDate, proj.paymentTermsDays), paymentStatus, gstFilingStatus, filingReference, gstFilingDueDate: filingDueDate,
    });
    deductions.forEach(([type, amount], k) => db.invoiceDeductions.push({ ...meta(`ivd_${proj.key}_${d.index + 1}_${k + 1}`), invoiceId: id, deductionTypeId: type, amount }));
    if (spec.contractType === "FIXED_SCOPE") {
      db.retentionEntries.push({
        ...meta(`ret_inv_${proj.key}_${d.index + 1}`), side: "CLIENT", projectId: proj.id, workOrderId: null, invoiceId: id, type: "WITHHELD", amount: percentOf(taxable, 5), date: d.invoiceDate,
      });
    }

    if (received !== "0.00") {
      db.payments.push({
        ...meta(`pay_inv_${proj.key}_${d.index + 1}`), direction: "IN", purpose: "INVOICE_RECEIPT", amount: received, paidOn: paidOn >= today ? addDays(today, -1) : paidOn, mode: "BANK_TRANSFER",
        utr: `UTR${rng.int(100000000, 999999999)}`, regionId: proj.regionId, projectId: proj.id, gstRegistrationId: proj.gstId, organisationId: proj.organisationId, invoiceId: id, remarks: null,
      });
    }

    const org = db.organisations.find((o) => o.id === proj.organisationId)!;
    db.gstTransactions.push({
      ...meta(`gst_inv_${proj.key}_${d.index + 1}`), gstRegistrationId: proj.gstId, direction: "OUTWARD", sourceType: "INVOICE", sourceId: id, partyName: org.name,
      partyGstin: customerGstin(placeOfSupply, proj.organisationId), invoiceNo, invoiceDate: d.invoiceDate, period: d.invoiceDate.slice(0, 7), taxableValue: taxable,
      cgst, sgst, igst, itcEligible: false, rate: "18.0000",
    });
    if (received !== "0.00") {
      const tds = percentOf(taxable, 2);
      const tdsHalf = percentOf(tds, 50);
      db.gstTransactions.push({
        ...meta(`gst_tds_${proj.key}_${d.index + 1}`), gstRegistrationId: proj.gstId, direction: "TDS_RECEIVED", sourceType: "INVOICE", sourceId: id, partyName: org.name,
        partyGstin: customerGstin(placeOfSupply, proj.organisationId), invoiceNo, invoiceDate: d.invoiceDate, period: d.invoiceDate.slice(0, 7), taxableValue: taxable,
        cgst: intra ? tdsHalf : "0.00", sgst: intra ? subMoney(tds, tdsHalf) : "0.00", igst: intra ? "0.00" : tds, itcEligible: false, rate: "2.0000",
      });
    }
  });

  // ---- Tender-side money: tender fees, EMD out, EMD refunds in ----
  db.tenders.forEach((t) => {
    const reachedPrep = db.tenderStageHistory.some((h) => h.tenderId === t.id && h.toStageId === "stg_bid_preparing");
    const deadline = t.submissionDeadlineAt.slice(0, 10);
    if (reachedPrep) {
      db.payments.push({
        ...meta(`pay_fee_${t.id}`), direction: "OUT", purpose: "TENDER_FEE", amount: t.tenderFee, paidOn: addDays(deadline, -8), mode: "ONLINE", utr: `UTR${rng.int(100000000, 999999999)}`,
        regionId: t.regionId, projectId: null, gstRegistrationId: t.gstRegistrationId ?? null, organisationId: t.organisationId, remarks: "Tender document fee",
      });
    }
    const emd = db.securityInstruments.find((s) => s.type === "EMD" && s.tenderId === t.id);
    if (emd && emd.mode !== "BG" && emd.issueDate) {
      db.payments.push({
        ...meta(`pay_emd_${t.id}`), direction: "OUT", purpose: "EMD", amount: emd.amount, paidOn: emd.issueDate, mode: emd.mode === "DD" ? "DD" : "ONLINE", utr: emd.instrumentNo ?? null,
        regionId: t.regionId, projectId: null, gstRegistrationId: t.gstRegistrationId ?? null, organisationId: t.organisationId, securityInstrumentId: emd.id, remarks: null,
      });
      const refund = db.securityInstrumentEvents.find((e) => e.securityInstrumentId === emd.id && e.type === "REFUNDED");
      if (refund) {
        db.payments.push({
          ...meta(`pay_emdref_${t.id}`), direction: "IN", purpose: "EMD_REFUND", amount: emd.amount, paidOn: refund.date, mode: "BANK_TRANSFER", utr: null, regionId: t.regionId, projectId: null,
          gstRegistrationId: t.gstRegistrationId ?? null, organisationId: t.organisationId, securityInstrumentId: emd.id, remarks: null,
        });
      }
    }
  });
}

