import { addDays, daysBetween } from "@/lib/dates";
import { addMoney, percentOf, subMoney, sumMoney } from "@/lib/money";
import type { BillStatus, Money } from "@/types";
import { addApproval } from "./approvals";
import { at, dayOffset, meta, pad, rupees, StateOf, type RegionKeyName, type SeedCtx } from "./helpers";
import { userId } from "./org";
import { monthsElapsed } from "./plan";
import type { ProjectInfo } from "./projects";
import { SUBS, WORK_ORDERS, woCategory } from "./workorders";

export interface VendorSeed {
  id: string;
  name: string;
  region: RegionKeyName;
  city: string;
  pan: string;
  gstin: string;
  contact: string;
  phone: string;
  trade: string;
}

export const VENDORS: VendorSeed[] = [
  { id: "1", name: "Coastal Paints & Coatings Pvt. Ltd.", region: "south", city: "Chennai", pan: "AAFCC6610J", gstin: "33AAFCC6610J1ZM", contact: "Vijayakumar R", phone: "98410 33011", trade: "Industrial paints and coatings" },
  { id: "2", name: "Raipur Industrial Coatings", region: "cg", city: "Raipur", pan: "AABFR9087G", gstin: "22AABFR9087G1Z2", contact: "Harish Khatri", phone: "98270 44120", trade: "Paints, grit and abrasives" },
  { id: "3", name: "Jindal Steel Traders", region: "cg", city: "Korba", pan: "AADFJ4410M", gstin: "22AADFJ4410M1ZC", contact: "Naveen Jindal", phone: "98930 12288", trade: "Structural steel and plates" },
  { id: "4", name: "Nagpur Steel & Hardware", region: "mh", city: "Nagpur", pan: "AAMFN3320P", gstin: "27AAMFN3320P1ZR", contact: "Jayesh Thakkar", phone: "98221 70455", trade: "Steel, cement and hardware" },
  { id: "5", name: "Basalt Pipes India Ltd.", region: "mh", city: "Nagpur", pan: "AAECB7096F", gstin: "27AAECB7096F1ZK", contact: "Sanjay Bapat", phone: "98500 28810", trade: "Cast basalt lined pipes" },
  { id: "6", name: "Delhi Safety & Industrial Supplies", region: "delhi", city: "Delhi", pan: "AAPFD1127C", gstin: "07AAPFD1127C1ZS", contact: "Anil Bansal", phone: "98717 30219", trade: "PPE and industrial supplies" },
  { id: "7", name: "Chennai Scaffold Systems", region: "south", city: "Chennai", pan: "AAGFC2290D", gstin: "33AAGFC2290D1ZB", contact: "Palani S", phone: "98410 33012", trade: "Scaffolding tubes and fittings" },
];

const REGION_CODE: Record<RegionKeyName, string> = { cg: "CG", mh: "MH", south: "SO", delhi: "DL" };

export function seedParties(ctx: SeedCtx, projects: ProjectInfo[]) {
  const { db, rng } = ctx;

  SUBS.forEach((s) => {
    db.parties.push({
      ...meta(`party_sub_${s.id}`), name: s.name, gstin: s.gstin, pan: s.pan, address: `${s.city}`, stateId: s.state, contactName: s.contact, phone: s.phone, email: null, isActive: true,
    });
    db.subcontractors.push({ ...meta(`sub_${s.id}`), partyId: `party_sub_${s.id}`, tradeCategory: s.trade, isLabourSupplier: !!s.labour, status: "ACTIVE" });
  });
  VENDORS.forEach((v) => {
    db.parties.push({
      ...meta(`party_ven_${v.id}`), name: v.name, gstin: v.gstin, pan: v.pan, address: v.city, stateId: StateOf[v.region], contactName: v.contact, phone: v.phone, email: null, isActive: true,
    });
    db.vendors.push({ ...meta(`ven_${v.id}`), partyId: `party_ven_${v.id}`, category: v.trade, isActive: true });
  });

  WORK_ORDERS.forEach((w) => {
    const proj = projects.find((p) => p.key === w.project)!;
    const sub = SUBS.find((s) => s.id === w.sub)!;
    const woId = `wo_${w.id}`;
    const start = addDays(proj.startDate, 10);
    const value = rupees(w.valueRupees);
    const progress = Math.min(98, Math.max(2, proj.actualPct * rng.float(0.9, 1.15)));
    db.workOrders.push({
      ...meta(woId), subcontractorId: `sub_${w.sub}`, projectId: proj.id, siteId: proj.siteId, regionId: proj.regionId,
      workOrderNo: `SPH/${REGION_CODE[proj.regionKey]}/WO/2026/${pad(Number(w.id) * 7 + 3)}`, trade: w.trade, scope: w.scope, progressPercent: progress.toFixed(4),
      contractValue: value, startDate: start, endDate: addDays(start, Math.max(120, daysBetween(proj.startDate, proj.endDate) - 20)), retentionPercent: woCategory(w.trade) === "ec_labour" ? "0.0000" : "5.0000", status: "ACTIVE",
    });

    // Bills: cumulative billed value tracks the work order's progress.
    const billedTotal = Math.round(w.valueRupees * Math.min(0.95, (progress / 100) * 1.05));
    const first = addDays(start, 30);
    const last = dayOffset(-6);
    const span = daysBetween(first, last);
    if (span < 0 || billedTotal <= 0) return;
    const n = Math.max(1, Math.min(5, monthsElapsed(proj) - 1));
    let remaining = billedTotal;
    const abbr = sub.name.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();

    for (let i = 0; i < n; i++) {
      const fromNewest = n - 1 - i;
      const gross = i === n - 1 ? remaining : Math.round(billedTotal / n / 1000) * 1000;
      remaining -= gross;
      const billDate = addDays(first, n === 1 ? span : Math.round((i * span) / (n - 1)));
      const periodTo = addDays(billDate, -3);
      const status: BillStatus = fromNewest === 0 ? w.lastBill : fromNewest === 1 && w.id === "2" ? "PARTLY_PAID" : "PAID";
      const grossM: Money = rupees(gross);
      const gst = percentOf(grossM, 18);
      const labour = woCategory(w.trade) === "ec_labour";
      const deductions: { type: string; amount: Money; remarks?: string }[] = [{ type: "ded_tds_it", amount: percentOf(grossM, 2) }];
      if (!labour) deductions.unshift({ type: "ded_retention", amount: percentOf(grossM, 5) });
      if (i === 0 && ["3", "8", "12"].includes(w.id)) deductions.push({ type: "ded_advance", amount: percentOf(grossM, 8), remarks: "Mobilisation advance recovery" });
      if (w.penalty && fromNewest === 0) deductions.push({ type: "ded_penalty", amount: rupees(25000), remarks: "Delay penalty, 4 days" });
      const totalDed = sumMoney(deductions.map((d) => d.amount));
      const net = subMoney(addMoney(grossM, gst), totalDed);
      const paid: Money = status === "PAID" ? net : status === "PARTLY_PAID" ? percentOf(net, 60) : "0.00";
      const billId = `sbill_${w.id}_${i + 1}`;
      const billNo = `SB/${abbr}/${pad(Number(w.id), 2)}/${pad(i + 1, 2)}`;
      const approvalId = `apr_sbill_${w.id}_${i + 1}`;

      db.subcontractorBills.push({
        ...meta(billId, at(billDate)), workOrderId: woId, subcontractorId: `sub_${w.sub}`, projectId: proj.id, regionId: proj.regionId, gstRegistrationId: proj.gstId,
        billNo, billDate, periodFrom: addDays(periodTo, -29), periodTo, grossAmount: grossM, gstAmount: gst, totalDeductions: totalDed, netPayable: net, paidAmount: paid, status, approvalRequestId: approvalId,
      });
      deductions.forEach((d, k) =>
        db.subcontractorBillDeductions.push({ ...meta(`sbd_${w.id}_${i + 1}_${k + 1}`), billId, deductionTypeId: d.type, amount: d.amount, remarks: d.remarks ?? null }),
      );
      if (!labour) {
        db.retentionEntries.push({
          ...meta(`ret_sb_${w.id}_${i + 1}`), side: "SUBCONTRACTOR", projectId: proj.id, workOrderId: woId, invoiceId: null, type: "WITHHELD", amount: percentOf(grossM, 5), date: billDate,
        });
      }
      const pending = status === "SUBMITTED";
      addApproval(ctx, {
        id: approvalId, entityType: "SUBCONTRACTOR_BILL", entityId: billId, amount: net, regionId: proj.regionId, projectId: proj.id, title: `Subcontractor bill ${billNo}`,
        requestedById: userId(proj.pmKey), approverId: userId(proj.pmKey), status: pending ? "PENDING" : "APPROVED", submittedOn: addDays(billDate, 1),
        decidedOn: pending ? undefined : addDays(billDate, 3), comment: pending ? undefined : "Measurements verified.",
      });

      if (status === "PAID" || status === "PARTLY_PAID") {
        db.payments.push({
          ...meta(`pay_sb_${w.id}_${i + 1}`), direction: "OUT", purpose: "SUBCONTRACTOR", amount: paid, paidOn: addDays(billDate, 25), mode: "BANK_TRANSFER",
          utr: `UTR${rng.int(100000000, 999999999)}`, regionId: proj.regionId, projectId: proj.id, gstRegistrationId: proj.gstId, partyId: `party_sub_${w.sub}`, subcontractorBillId: billId, remarks: null,
        });
      }

      db.costEntries.push({
        ...meta(`ce_sb_${w.id}_${i + 1}`), projectId: proj.id, siteId: proj.siteId, regionId: proj.regionId, expenseCategoryId: woCategory(w.trade), kind: "ACTUAL",
        sourceType: "SUBCONTRACTOR_BILL", sourceId: billId, amount: grossM, date: billDate,
      });
      const half = percentOf(gst, 50);
      const inter = sub.state !== proj.stateId;
      db.gstTransactions.push({
        ...meta(`gst_sb_${w.id}_${i + 1}`), gstRegistrationId: proj.gstId, direction: "INWARD", sourceType: "SUBCONTRACTOR_BILL", sourceId: billId, partyName: sub.name, partyGstin: sub.gstin,
        invoiceNo: billNo, invoiceDate: billDate, period: billDate.slice(0, 7), taxableValue: grossM, cgst: inter ? "0.00" : half, sgst: inter ? "0.00" : subMoney(gst, half), igst: inter ? gst : "0.00",
        itcEligible: true, rate: "18.0000",
      });
    }

    const billedGross = db.subcontractorBills.filter((b) => b.workOrderId === woId).reduce((acc, b) => acc + Number(b.grossAmount), 0);
    db.costEntries.push({
      ...meta(`ce_wo_${w.id}`), projectId: proj.id, siteId: proj.siteId, regionId: proj.regionId, expenseCategoryId: woCategory(w.trade), kind: "COMMITTED",
      sourceType: "WORK_ORDER", sourceId: woId, amount: rupees(Math.max(0, Math.round(w.valueRupees - billedGross))), date: start,
    });
  });
}
