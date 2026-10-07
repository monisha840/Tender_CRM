import { addDays, DEMO_TODAY } from "@/lib/dates";
import { addMoney, percentOf, subMoney, sumMoney } from "@/lib/money";
import type { Money, RaBillStatus } from "@/types";
import { actualRupees, BUDGET_SHARE, budgetRupees, contractRupees, monthsElapsed, splitRupees, type CategoryId } from "./plan";
import type { ProjectInfo } from "./projects";
import { at, dayOffset, meta, pad, rupees, type SeedCtx } from "./helpers";

const OVERDUE_PROJECTS = ["korba_pipe", "del_drain"];

export function seedAccounts(ctx: SeedCtx, projects: ProjectInfo[]) {
  const { db, rng } = ctx;
  const today = DEMO_TODAY;

  projects.forEach((proj) => {
    // ---- Budget lines ----
    (Object.keys(BUDGET_SHARE) as CategoryId[]).forEach((cat) =>
      db.projectBudgetLines.push({
        ...meta(`pbl_${proj.key}_${cat}`), projectId: proj.id, expenseCategoryId: cat, plannedAmount: rupees(budgetRupees(proj, cat)),
      }),
    );

    // ---- Labour / equipment / overheads actuals (monthly), topping up whatever bills already cover ----
    const months = monthsElapsed(proj);
    const monthDate = (k: number) => {
      const d = addDays(proj.startDate, 30 * (k + 1));
      return d > today ? addDays(today, -1) : d;
    };
    (["ec_labour", "ec_equipment", "ec_overheads"] as CategoryId[]).forEach((cat) => {
      const already = db.costEntries
        .filter((c) => c.projectId === proj.id && c.expenseCategoryId === cat && c.kind === "ACTUAL")
        .reduce((a, c) => a + Number(c.amount), 0);
      const remaining = Math.round(actualRupees(proj, cat) - already);
      if (remaining <= 0) return;
      splitRupees(remaining, months, rng.next, 0.3).forEach((amt, k) =>
        db.costEntries.push({
          ...meta(`ce_${cat}_${proj.key}_${k + 1}`), projectId: proj.id, siteId: proj.siteIds[k % proj.siteIds.length], regionId: proj.regionId,
          expenseCategoryId: cat, kind: "ACTUAL", sourceType: cat === "ec_labour" ? "PAYROLL" : "EXPENSE", sourceId: `${cat}_${proj.key}_${k + 1}`,
          amount: rupees(amt), date: monthDate(k),
        }),
      );
    });

    // ---- RA bills to the department ----
    const lastBillDate = dayOffset(-4);
    const earliest = addDays(proj.startDate, 20);
    const billDates: string[] = [];
    for (let k = 0; k < 6; k++) {
      const d = addDays(lastBillDate, -30 * k);
      if (d >= earliest) billDates.unshift(d);
    }
    const n = billDates.length;
    if (n === 0) return;
    const billedTotal = Math.round(contractRupees(proj) * (proj.actualPct / 100) * 0.97);
    const parts = splitRupees(billedTotal, n, rng.next, 0.2);
    let cumulative = 0;

    billDates.forEach((billDate, i) => {
      const fromNewest = n - 1 - i;
      cumulative += parts[i];
      const gross = rupees(parts[i]);
      const gst = percentOf(gross, 18);
      const deductions: [string, Money][] = [
        ["ded_retention", percentOf(gross, 5)],
        ["ded_tds_it", percentOf(gross, 2)],
        ["ded_tds_gst", percentOf(gross, 2)],
        ["ded_cess", percentOf(gross, 1)],
      ];
      if (proj.key === "mh_school" && fromNewest === 1) deductions.push(["ded_penalty", rupees(50000)]);
      if (proj.key === "del_drain" && fromNewest === 0) deductions.push(["ded_penalty", rupees(25000)]);
      const totalDed = sumMoney(deductions.map(([, a]) => a));
      const net = subMoney(addMoney(gross, gst), totalDed);

      let status: RaBillStatus = "RECEIVED";
      let received = net;
      if (fromNewest === 0) { status = "SUBMITTED"; received = "0.00"; }
      else if (fromNewest === 1) { status = "CERTIFIED"; received = "0.00"; }
      else if (OVERDUE_PROJECTS.includes(proj.key) && fromNewest === 2) { status = "CERTIFIED"; received = "0.00"; }
      else if (proj.key === "mh_school" && fromNewest === 2) { status = "PARTLY_RECEIVED"; received = percentOf(net, 50); }

      const id = `rab_${proj.key}_${i + 1}`;
      const periodTo = addDays(billDate, -3);
      db.raBills.push({
        ...meta(id, at(billDate)),
        projectId: proj.id, regionId: proj.regionId, clientId: proj.clientId, gstRegistrationId: proj.gstId, billType: "RA", billNo: `RA-${pad(i + 1, 2)}`,
        periodFrom: addDays(periodTo, -29), periodTo, billDate, grossAmount: gross, cumulativeGross: rupees(cumulative), gstAmount: gst,
        totalDeductions: totalDed, netPayable: net, receivedAmount: received, dueDate: addDays(billDate, 45), status,
      });
      deductions.forEach(([type, amount], k) => db.raBillDeductions.push({ ...meta(`rbd_${proj.key}_${i + 1}_${k + 1}`), raBillId: id, deductionTypeId: type, amount }));
      db.retentionEntries.push({
        ...meta(`ret_ra_${proj.key}_${i + 1}`), side: "CLIENT", projectId: proj.id, workOrderId: null, raBillId: id, type: "WITHHELD",
        amount: percentOf(gross, 5), date: billDate,
      });

      if (received !== "0.00") {
        const paidOn = addDays(billDate, rng.int(28, 42));
        db.payments.push({
          ...meta(`pay_ra_${proj.key}_${i + 1}`), direction: "IN", purpose: "RA_RECEIPT", amount: received, paidOn: paidOn > today ? addDays(today, -1) : paidOn,
          mode: "BANK_TRANSFER", utr: `UTR${rng.int(100000000, 999999999)}`, regionId: proj.regionId, projectId: proj.id, gstRegistrationId: proj.gstId,
          clientId: proj.clientId, raBillId: id, remarks: null,
        });
      }

      const half = percentOf(gst, 50);
      db.gstTransactions.push({
        ...meta(`gst_ra_${proj.key}_${i + 1}`), gstRegistrationId: proj.gstId, direction: "OUTWARD", sourceType: "RA_BILL", sourceId: id,
        partyName: db.clients.find((c) => c.id === proj.clientId)!.name, partyGstin: null, invoiceNo: `RA-${pad(i + 1, 2)}/${proj.key.toUpperCase().slice(0, 6)}`,
        invoiceDate: billDate, period: billDate.slice(0, 7), taxableValue: gross, cgst: half, sgst: subMoney(gst, half), igst: "0.00", itcEligible: false, rate: "18.0000",
      });
      const tds = percentOf(gross, 2);
      const tdsHalf = percentOf(tds, 50);
      if (received !== "0.00") {
        db.gstTransactions.push({
          ...meta(`gst_tds_${proj.key}_${i + 1}`), gstRegistrationId: proj.gstId, direction: "TDS_RECEIVED", sourceType: "RA_BILL", sourceId: id,
          partyName: db.clients.find((c) => c.id === proj.clientId)!.name, partyGstin: null, invoiceNo: `RA-${pad(i + 1, 2)}`, invoiceDate: billDate,
          period: billDate.slice(0, 7), taxableValue: gross, cgst: tdsHalf, sgst: subMoney(tds, tdsHalf), igst: "0.00", itcEligible: false, rate: "2.0000",
        });
      }
    });
  });

  // ---- Tender-side money: tender fees, EMD out, EMD refunds in ----
  db.tenders.forEach((t) => {
    const deadline = t.submissionDeadlineAt.slice(0, 10);
    const reachedPrep = db.tenderStageHistory.some((h) => h.tenderId === t.id && h.toStageId === "stg_preparation");
    if (reachedPrep) {
      db.payments.push({
        ...meta(`pay_fee_${t.id}`), direction: "OUT", purpose: "TENDER_FEE", amount: t.tenderFee, paidOn: addDays(deadline, -8), mode: "ONLINE",
        utr: `UTR${rng.int(100000000, 999999999)}`, regionId: t.regionId, projectId: null, gstRegistrationId: t.gstRegistrationId ?? null,
        clientId: t.clientId, remarks: "Tender document fee",
      });
    }
    const emd = db.securityInstruments.find((s) => s.type === "EMD" && s.tenderId === t.id);
    if (emd && emd.mode !== "BG" && emd.issueDate) {
      db.payments.push({
        ...meta(`pay_emd_${t.id}`), direction: "OUT", purpose: "EMD", amount: emd.amount, paidOn: emd.issueDate, mode: emd.mode === "DD" ? "DD" : "ONLINE",
        utr: emd.instrumentNo ?? null, regionId: t.regionId, projectId: null, gstRegistrationId: t.gstRegistrationId ?? null, clientId: t.clientId,
        securityInstrumentId: emd.id, remarks: null,
      });
      const refund = db.securityInstrumentEvents.find((e) => e.securityInstrumentId === emd.id && e.type === "REFUNDED");
      if (refund) {
        db.payments.push({
          ...meta(`pay_emdref_${t.id}`), direction: "IN", purpose: "EMD_REFUND", amount: emd.amount, paidOn: refund.date, mode: "BANK_TRANSFER", utr: null,
          regionId: t.regionId, projectId: null, gstRegistrationId: t.gstRegistrationId ?? null, clientId: t.clientId, securityInstrumentId: emd.id, remarks: null,
        });
      }
    }
  });
}
