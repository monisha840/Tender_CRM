import { addDays, daysBetween } from "@/lib/dates";
import { addMoney, percentOf, subMoney, sumMoney } from "@/lib/money";
import type { BillStatus, Money } from "@/types";
import { addApproval } from "./approvals";
import { monthsElapsed } from "./plan";
import { userId } from "./org";
import type { ProjectInfo } from "./projects";
import { at, dayOffset, meta, pad, rupees, StateOf, type RegionKeyName, type SeedCtx } from "./helpers";

interface PartySeed {
  id: string;
  name: string;
  region: RegionKeyName;
  pan: string;
  gstin: string;
  contact: string;
  phone: string;
  trade: string;
}

const SUBS: (PartySeed & { labour?: boolean })[] = [
  { id: "1", name: "Shree Ganesh Earthworks", region: "korba", pan: "AAFCS4821K", gstin: "22AAFCS4821K1ZV", contact: "Mahesh Sahu", phone: "98931 40021", trade: "Earthwork & excavation" },
  { id: "2", name: "Bhilai Steel Fabricators", region: "korba", pan: "AAECB7712D", gstin: "22AAECB7712D1Z4", contact: "Suresh Rathore", phone: "98270 51442", trade: "Steel fabrication & shuttering" },
  { id: "3", name: "Delhi Pavers & Co.", region: "delhi", pan: "AAHFD3390R", gstin: "07AAHFD3390R1ZB", contact: "Gurpreet Singh", phone: "98100 77310", trade: "Paving, kerb & precast" },
  { id: "4", name: "Maa Durga Labour Contractors", region: "korba", pan: "ABCPD5521L", gstin: "22ABCPD5521L1ZA", contact: "Kamta Prasad", phone: "97550 22190", trade: "Labour supply", labour: true },
  { id: "5", name: "Vidarbha Piling & Foundations", region: "mh", pan: "AAGCV1148N", gstin: "27AAGCV1148N1Z6", contact: "Ravindra Wankhede", phone: "98223 61045", trade: "Foundation & piling" },
  { id: "6", name: "Pune Structural Works", region: "mh", pan: "AAIFP6603J", gstin: "27AAIFP6603J1ZP", contact: "Tanaji Bhosale", phone: "98900 18734", trade: "RCC frame works" },
];

export const VENDORS: PartySeed[] = [
  { id: "1", name: "Korba Cement Depot", region: "korba", pan: "AAKFK2204B", gstin: "22AAKFK2204B1ZE", contact: "Pawan Agrawal", phone: "98261 33011", trade: "Cement & building material" },
  { id: "2", name: "Raipur Bitumen & Oils", region: "korba", pan: "AABCR9087G", gstin: "22AABCR9087G1Z2", contact: "Harish Khatri", phone: "98270 44120", trade: "Bitumen & fuel" },
  { id: "3", name: "Jindal Steel Traders", region: "korba", pan: "AADFJ4410M", gstin: "22AADFJ4410M1ZC", contact: "Naveen Jindal", phone: "98930 12288", trade: "TMT steel" },
  { id: "4", name: "Delhi Aggregate Suppliers", region: "delhi", pan: "AAJFD8815Q", gstin: "07AAJFD8815Q1ZH", contact: "Ramesh Chand", phone: "98111 90022", trade: "Aggregates & sand" },
  { id: "5", name: "Nagpur Hardware Mart", region: "mh", pan: "AAMFN3320P", gstin: "27AAMFN3320P1ZR", contact: "Jayesh Thakkar", phone: "98221 70455", trade: "Hardware & fittings" },
  { id: "6", name: "Maharashtra Pipes Ltd.", region: "mh", pan: "AAECM7096F", gstin: "27AAECM7096F1ZK", contact: "Sanjay Bapat", phone: "98500 28810", trade: "Pipes & valves" },
  { id: "7", name: "Delhi Build Mart", region: "delhi", pan: "AAPFD1127C", gstin: "07AAPFD1127C1ZS", contact: "Anil Bansal", phone: "98717 30219", trade: "Cement & building material" },
];

interface WoSeed {
  id: string;
  sub: string;
  project: string;
  site: string;
  scope: string;
  valueLakh: number;
  /** Bill states, newest bill first. */
  lastBill: BillStatus;
  penalty?: boolean;
}

const WOS: WoSeed[] = [
  { id: "1", sub: "1", project: "korba_road", site: "site_korba_road_1", scope: "Earthwork and excavation, Km 0–5.2", valueLakh: 38, lastBill: "SUBMITTED" },
  { id: "2", sub: "1", project: "korba_pipe", site: "site_korba_pipe_1", scope: "Trench excavation and backfilling", valueLakh: 45, lastBill: "APPROVED" },
  { id: "3", sub: "4", project: "korba_road", site: "site_korba_road_1", scope: "Supply of skilled and unskilled labour (25 nos.)", valueLakh: 28, lastBill: "APPROVED" },
  { id: "4", sub: "2", project: "korba_hall", site: "site_korba_hall_1", scope: "Steel fabrication and shuttering", valueLakh: 22, lastBill: "APPROVED" },
  { id: "5", sub: "3", project: "del_road", site: "site_del_road_1", scope: "Paver block and kerb laying", valueLakh: 40, lastBill: "SUBMITTED" },
  { id: "6", sub: "3", project: "del_drain", site: "site_del_drain_1", scope: "Precast cover slab supply and fixing", valueLakh: 55, lastBill: "APPROVED", penalty: true },
  { id: "7", sub: "5", project: "mh_culvert", site: "site_mh_culvert_1", scope: "Foundation and pile works", valueLakh: 85, lastBill: "SUBMITTED" },
  { id: "8", sub: "6", project: "mh_school", site: "site_mh_school_1", scope: "RCC frame labour contract", valueLakh: 120, lastBill: "APPROVED" },
  { id: "9", sub: "4", project: "korba_pipe", site: "site_korba_pipe_2", scope: "Labour supply for pipe laying (20 nos.)", valueLakh: 30, lastBill: "APPROVED" },
];

export function seedParties(ctx: SeedCtx, projects: ProjectInfo[]) {
  const { db, rng } = ctx;

  SUBS.forEach((s) => {
    db.parties.push({
      ...meta(`party_sub_${s.id}`), name: s.name, gstin: s.gstin, pan: s.pan,
      address: `${s.name.split(" ")[0]} Industrial Area, ${s.region === "korba" ? "Korba" : s.region === "delhi" ? "Delhi" : "Nagpur"}`,
      stateId: StateOf[s.region], contactName: s.contact, phone: s.phone, email: null, isActive: true,
    });
    db.subcontractors.push({
      ...meta(`sub_${s.id}`), partyId: `party_sub_${s.id}`, tradeCategory: s.trade, isLabourSupplier: !!s.labour, status: "ACTIVE",
    });
  });
  VENDORS.forEach((v) => {
    db.parties.push({
      ...meta(`party_ven_${v.id}`), name: v.name, gstin: v.gstin, pan: v.pan,
      address: `${v.name.split(" ")[0]} Market, ${v.region === "korba" ? "Korba" : v.region === "delhi" ? "Delhi" : "Nagpur"}`,
      stateId: StateOf[v.region], contactName: v.contact, phone: v.phone, email: null, isActive: true,
    });
    db.vendors.push({ ...meta(`ven_${v.id}`), partyId: `party_ven_${v.id}`, category: v.trade, isActive: true });
  });

  WOS.forEach((w) => {
    const proj = projects.find((p) => p.key === w.project)!;
    const woId = `wo_${w.id}`;
    const start = addDays(proj.startDate, 10);
    const value = rupees(w.valueLakh * 100000);
    db.workOrders.push({
      ...meta(woId), subcontractorId: `sub_${w.sub}`, projectId: proj.id, siteId: w.site, regionId: proj.regionId,
      workOrderNo: `WO/${proj.regionKey === "korba" ? "KRB" : proj.regionKey === "delhi" ? "DEL" : "MH"}/2026/${pad(Number(w.id) * 7 + 3)}`,
      scope: w.scope, contractValue: value, startDate: start, endDate: addDays(start, 300), retentionPercent: "5.0000", status: "ACTIVE",
    });

    // Bills: cumulative billed value tracks project progress.
    const billedFraction = Math.min(0.95, (proj.actualPct / 100) * 1.15);
    const billedTotal = Math.round(w.valueLakh * 100000 * billedFraction);
    const first = addDays(start, 30);
    const last = dayOffset(-6);
    const span = daysBetween(first, last);
    if (span < 0 || billedTotal <= 0) return;
    const n = Math.max(1, Math.min(5, monthsElapsed(proj) - 1));
    let remaining = billedTotal;

    for (let i = 0; i < n; i++) {
      const fromNewest = n - 1 - i;
      const gross = i === n - 1 ? remaining : Math.round(billedTotal / n / 1000) * 1000;
      remaining -= gross;
      const billDate = addDays(first, n === 1 ? span : Math.round((i * span) / (n - 1)));
      const periodTo = addDays(billDate, -3);
      const status: BillStatus = fromNewest === 0 ? w.lastBill : fromNewest === 1 && w.id === "2" ? "PARTLY_PAID" : "PAID";
      const grossM: Money = rupees(gross);
      const gst = percentOf(grossM, 18);
      const deductions: { type: string; amount: Money; remarks?: string }[] = [
        { type: "ded_retention", amount: percentOf(grossM, 5) },
        { type: "ded_tds_it", amount: percentOf(grossM, 2) },
      ];
      if (i === 0 && ["2", "5", "9"].includes(w.id)) deductions.push({ type: "ded_advance", amount: percentOf(grossM, 8), remarks: "Mobilisation advance recovery" });
      if (w.penalty && fromNewest === 0) deductions.push({ type: "ded_penalty", amount: rupees(10000), remarks: "Delay penalty, 4 days" });
      const totalDed = sumMoney(deductions.map((d) => d.amount));
      const net = subMoney(addMoney(grossM, gst), totalDed);
      const paid: Money = status === "PAID" ? net : status === "PARTLY_PAID" ? percentOf(net, 60) : "0.00";
      const billId = `sbill_${w.id}_${i + 1}`;
      const subShort = SUBS.find((s) => s.id === w.sub)!.name.split(" ")[0].slice(0, 3).toUpperCase();

      db.subcontractorBills.push({
        ...meta(billId, at(billDate)),
        workOrderId: woId, subcontractorId: `sub_${w.sub}`, projectId: proj.id, regionId: proj.regionId, gstRegistrationId: proj.gstId,
        billNo: `SB/${subShort}/${pad(i + 1, 2)}`, billDate, periodFrom: addDays(periodTo, -29), periodTo,
        grossAmount: grossM, gstAmount: gst, totalDeductions: totalDed, netPayable: net, paidAmount: paid, status,
        approvalRequestId: status === "SUBMITTED" ? `apr_sbill_${w.id}_${i + 1}` : null,
      });
      deductions.forEach((d, k) =>
        db.subcontractorBillDeductions.push({ ...meta(`sbd_${w.id}_${i + 1}_${k + 1}`), billId, deductionTypeId: d.type, amount: d.amount, remarks: d.remarks ?? null }),
      );
      db.retentionEntries.push({
        ...meta(`ret_sb_${w.id}_${i + 1}`), side: "SUBCONTRACTOR", projectId: proj.id, workOrderId: woId, raBillId: null,
        type: "WITHHELD", amount: percentOf(grossM, 5), date: billDate,
      });

      if (status === "SUBMITTED") {
        addApproval(ctx, {
          id: `apr_sbill_${w.id}_${i + 1}`, entityType: "SUBCONTRACTOR_BILL", entityId: billId, amount: net, regionId: proj.regionId,
          projectId: proj.id, title: `Subcontractor bill SB/${subShort}/${pad(i + 1, 2)}`,
          requestedById: userId(proj.pmKey), approverId: userId(proj.pmKey), status: "PENDING", submittedOn: addDays(billDate, 1),
        });
      } else {
        addApproval(ctx, {
          id: `apr_sbill_${w.id}_${i + 1}`, entityType: "SUBCONTRACTOR_BILL", entityId: billId, amount: net, regionId: proj.regionId,
          projectId: proj.id, title: `Subcontractor bill SB/${subShort}/${pad(i + 1, 2)}`,
          requestedById: userId(proj.pmKey), approverId: userId(proj.pmKey), status: "APPROVED", submittedOn: addDays(billDate, 1),
          decidedOn: addDays(billDate, 3), comment: "Measurements verified.",
        });
        db.subcontractorBills[db.subcontractorBills.length - 1].approvalRequestId = `apr_sbill_${w.id}_${i + 1}`;
      }

      if (status === "PAID" || status === "PARTLY_PAID") {
        db.payments.push({
          ...meta(`pay_sb_${w.id}_${i + 1}`), direction: "OUT", purpose: "SUBCONTRACTOR", amount: paid, paidOn: addDays(billDate, 25),
          mode: "BANK_TRANSFER", utr: `UTR${rng.int(100000000, 999999999)}`, regionId: proj.regionId, projectId: proj.id,
          gstRegistrationId: proj.gstId, partyId: `party_sub_${w.sub}`, subcontractorBillId: billId, remarks: null,
        });
      }

      // Cost + GST read models (ITC eligible except the labour-supplier bills, which stay simple here).
      db.costEntries.push({
        ...meta(`ce_sb_${w.id}_${i + 1}`), projectId: proj.id, siteId: w.site, regionId: proj.regionId,
        expenseCategoryId: w.sub === "4" ? "ec_labour" : "ec_subcontract", kind: "ACTUAL",
        sourceType: "SUBCONTRACTOR_BILL", sourceId: billId, amount: grossM, date: billDate,
      });
      const half = percentOf(gst, 50);
      db.gstTransactions.push({
        ...meta(`gst_sb_${w.id}_${i + 1}`), gstRegistrationId: proj.gstId, direction: "INWARD", sourceType: "SUBCONTRACTOR_BILL", sourceId: billId,
        partyName: SUBS.find((s) => s.id === w.sub)!.name, partyGstin: SUBS.find((s) => s.id === w.sub)!.gstin,
        invoiceNo: `SB/${subShort}/${pad(i + 1, 2)}`, invoiceDate: billDate, period: billDate.slice(0, 7), taxableValue: grossM,
        cgst: half, sgst: subMoney(gst, half), igst: "0.00", itcEligible: true, rate: "18.0000",
      });
    }

    const billedGross = db.subcontractorBills.filter((b) => b.workOrderId === woId).reduce((acc, b) => acc + Number(b.grossAmount), 0);
    const unbilled = Math.max(0, w.valueLakh * 100000 - billedGross);
    db.costEntries.push({
      ...meta(`ce_wo_${w.id}`), projectId: proj.id, siteId: w.site, regionId: proj.regionId,
      expenseCategoryId: w.sub === "4" ? "ec_labour" : "ec_subcontract", kind: "COMMITTED",
      sourceType: "WORK_ORDER", sourceId: woId, amount: rupees(Math.round(unbilled)), date: start,
    });
  });
}
