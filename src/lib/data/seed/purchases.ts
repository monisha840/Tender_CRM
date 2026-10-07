import { addDays, daysBetween } from "@/lib/dates";
import { addMoney, percentOf, subMoney } from "@/lib/money";
import type { Id, Money, VendorInvoiceStatus } from "@/types";
import { addApproval } from "./approvals";
import { actualRupees, budgetRupees, monthsElapsed, splitRupees } from "./plan";
import { userId } from "./org";
import type { ProjectInfo } from "./projects";
import { VENDORS } from "./parties";
import { SITE_USER } from "./workforce";
import { dayOffset, meta, pad, rupees, type RegionKeyName, type SeedCtx } from "./helpers";

/** Approximate market rates (₹ per unit) used to turn a spend into realistic quantities. */
const RATE: Record<string, number> = {
  mat_cement: 380, mat_steel: 62, mat_bitumen: 52000, mat_agg20: 1400, mat_sand: 1500, mat_gsb: 1100,
  mat_pipe: 9000, mat_brick: 9, mat_rmc: 5600, mat_diesel: 92,
};
const MATERIALS_BY_TEMPLATE: Record<ProjectInfo["template"], string[]> = {
  road: ["mat_bitumen", "mat_agg20", "mat_gsb"],
  building: ["mat_cement", "mat_steel", "mat_brick"],
  pipeline: ["mat_pipe", "mat_cement", "mat_sand"],
  drain: ["mat_cement", "mat_steel", "mat_rmc"],
  bridge: ["mat_cement", "mat_steel", "mat_agg20"],
  maintenance: ["mat_bitumen", "mat_agg20"],
};
const VENDORS_BY_REGION: Record<RegionKeyName, string[]> = { korba: ["1", "2", "3"], delhi: ["4", "7"], mh: ["5", "6"] };
const STATE_OF_VENDOR = (id: string) => VENDORS.find((v) => v.id === id)!.region;
const REGION_CODE: Record<RegionKeyName, string> = { korba: "KRB", delhi: "DEL", mh: "MH" };

export function seedPurchases(ctx: SeedCtx, projects: ProjectInfo[]) {
  const { db, rng } = ctx;
  let prNo = 0;
  let poNo = 0;

  const addRequest = (proj: ProjectInfo, siteId: Id, materialIds: string[], amount: number, status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ORDERED", neededBy: string, approverKey?: string, approverUser?: Id) => {
    const id = `pr_${++prNo}`;
    const amountM = rupees(amount);
    db.purchaseRequests.push({
      ...meta(id),
      requestNo: `PR/${REGION_CODE[proj.regionKey]}/${pad(prNo)}`,
      projectId: proj.id, siteId, regionId: proj.regionId, requestedById: SITE_USER[proj.regionKey].engineer, neededBy, status,
      estimatedAmount: amountM, approvalRequestId: status === "PENDING_APPROVAL" || status === "REJECTED" ? `apr_${id}` : null,
    });
    materialIds.forEach((m, i) =>
      db.purchaseRequestItems.push({
        ...meta(`pri_${id}_${i + 1}`), requestId: id, materialId: m,
        quantity: Math.max(1, Math.round(amount / materialIds.length / RATE[m])).toFixed(3),
      }),
    );
    if (status === "PENDING_APPROVAL" || status === "REJECTED") {
      addApproval(ctx, {
        id: `apr_${id}`, entityType: "PURCHASE_REQUEST", entityId: id, amount: amountM, regionId: proj.regionId, projectId: proj.id,
        title: `Purchase request PR/${REGION_CODE[proj.regionKey]}/${pad(prNo)}`, requestedById: SITE_USER[proj.regionKey].engineer,
        approverId: approverUser ?? userId(approverKey ?? proj.pmKey), status: status === "REJECTED" ? "REJECTED" : "PENDING",
        submittedOn: dayOffset(-2), decidedOn: dayOffset(-1), comment: status === "REJECTED" ? "Quantity exceeds BOQ requirement; revise." : undefined,
      });
    }
    return id;
  };

  const addPo = (proj: ProjectInfo, requestId: Id | null, vendorKey: string, siteId: Id, taxable: number, poDate: string, status: "APPROVED" | "PARTLY_RECEIVED" | "RECEIVED" | "PENDING_APPROVAL", approvalTo?: Id) => {
    const id = `po_${++poNo}`;
    const amount = rupees(taxable);
    const gst = percentOf(amount, 18);
    db.purchaseOrders.push({
      ...meta(id),
      poNo: `PO/${REGION_CODE[proj.regionKey]}/2026-27/${pad(poNo)}`,
      requestId, vendorId: `ven_${vendorKey}`, projectId: proj.id, siteId, regionId: proj.regionId, gstRegistrationId: proj.gstId,
      poDate, amount, gstAmount: gst, status, approvalRequestId: status === "PENDING_APPROVAL" ? `apr_${id}` : null,
    });
    if (status === "PENDING_APPROVAL") {
      addApproval(ctx, {
        id: `apr_${id}`, entityType: "PURCHASE_ORDER", entityId: id, amount: addMoney(amount, gst), regionId: proj.regionId, projectId: proj.id,
        title: `Purchase order PO/${REGION_CODE[proj.regionKey]}/2026-27/${pad(poNo)}`, requestedById: userId(proj.pmKey),
        approverId: approvalTo ?? userId("director"), status: "PENDING", submittedOn: dayOffset(-1),
      });
    }
    if (status === "APPROVED" || status === "PARTLY_RECEIVED") {
      db.costEntries.push({
        ...meta(`ce_po_${id}`), projectId: proj.id, siteId, regionId: proj.regionId, expenseCategoryId: "ec_materials", kind: "COMMITTED",
        sourceType: "PURCHASE_ORDER", sourceId: id, amount, date: poDate,
      });
    }
    return id;
  };

  projects.forEach((proj) => {
    const target = actualRupees(proj, "ec_materials");
    if (target <= 0) return;
    const n = Math.max(2, Math.min(4, monthsElapsed(proj) - 1));
    const parts = splitRupees(target, n, rng.next);
    const first = addDays(proj.startDate, 25);
    const last = dayOffset(-3);
    const span = Math.max(1, daysBetween(first, last));
    const vendors = VENDORS_BY_REGION[proj.regionKey];
    const materials = MATERIALS_BY_TEMPLATE[proj.template];
    const overdueProject = ["korba_pipe", "mh_school", "del_drain"].includes(proj.key);

    parts.forEach((taxableN, i) => {
      const invoiceDate = addDays(first, Math.round((i * span) / (n - 1)));
      const siteId = proj.siteIds[i % proj.siteIds.length];
      // mh_school buys its first steel lot from a Chhattisgarh vendor, so that invoice carries IGST.
      const vendorKey = proj.key === "mh_school" && i === 0 ? "3" : vendors[i % vendors.length];
      const interstate = STATE_OF_VENDOR(vendorKey) !== (proj.regionKey === "mh" ? "mh" : proj.regionKey === "delhi" ? "delhi" : "korba");
      const mats = proj.key === "mh_school" && i === 0 ? ["mat_steel"] : [materials[i % materials.length], materials[(i + 1) % materials.length]];
      const reqId = addRequest(proj, siteId, mats, taxableN, "ORDERED", addDays(invoiceDate, -5));
      const poId = addPo(proj, reqId, vendorKey, siteId, taxableN, addDays(invoiceDate, -10), "RECEIVED");

      const taxable = rupees(taxableN);
      const gst = percentOf(taxable, 18);
      const half = percentOf(gst, 50);
      const total = addMoney(taxable, gst);
      const fromNewest = n - 1 - i;
      let status: VendorInvoiceStatus = fromNewest === 0 ? "RECEIVED" : fromNewest === 1 && i % 2 === 1 ? "PARTLY_PAID" : "PAID";
      if (overdueProject && fromNewest === 1) status = "APPROVED"; // approved, due date passed, not yet paid
      const paid: Money = status === "PAID" ? total : status === "PARTLY_PAID" ? percentOf(total, 50) : "0.00";
      const id = `vinv_${proj.key}_${i + 1}`;
      const itc = !(proj.key === "korba_hall" && i === 0); // one invoice with blocked credit, to exercise the filter

      db.vendorInvoices.push({
        ...meta(id),
        invoiceNo: `INV-${rng.int(1000, 9999)}/${rng.int(24, 26)}`,
        purchaseOrderId: poId, vendorId: `ven_${vendorKey}`, projectId: proj.id, regionId: proj.regionId, gstRegistrationId: proj.gstId,
        invoiceDate, dueDate: addDays(invoiceDate, 30), taxableValue: taxable,
        cgst: interstate ? "0.00" : half, sgst: interstate ? "0.00" : subMoney(gst, half), igst: interstate ? gst : "0.00",
        total, paidAmount: paid, itcEligible: itc, status,
      });
      if (paid !== "0.00") {
        db.payments.push({
          ...meta(`pay_vi_${proj.key}_${i + 1}`), direction: "OUT", purpose: "VENDOR", amount: paid,
          paidOn: addDays(invoiceDate, status === "PAID" ? 24 : 28), mode: "BANK_TRANSFER", utr: `UTR${rng.int(100000000, 999999999)}`,
          regionId: proj.regionId, projectId: proj.id, gstRegistrationId: proj.gstId, partyId: `party_ven_${vendorKey}`,
          vendorInvoiceId: id, remarks: null,
        });
      }
      db.costEntries.push({
        ...meta(`ce_vi_${proj.key}_${i + 1}`), projectId: proj.id, siteId, regionId: proj.regionId, expenseCategoryId: "ec_materials", kind: "ACTUAL",
        sourceType: "VENDOR_INVOICE", sourceId: id, amount: taxable, date: invoiceDate,
      });
      db.gstTransactions.push({
        ...meta(`gst_vi_${proj.key}_${i + 1}`), gstRegistrationId: proj.gstId, direction: "INWARD", sourceType: "VENDOR_INVOICE", sourceId: id,
        partyName: VENDORS.find((v) => v.id === vendorKey)!.name, partyGstin: VENDORS.find((v) => v.id === vendorKey)!.gstin,
        invoiceNo: db.vendorInvoices[db.vendorInvoices.length - 1].invoiceNo, invoiceDate, period: invoiceDate.slice(0, 7),
        taxableValue: taxable, cgst: interstate ? "0.00" : half, sgst: interstate ? "0.00" : subMoney(gst, half), igst: interstate ? gst : "0.00",
        itcEligible: itc, rate: "18.0000",
      });

      // Site stock: goods received, then partly consumed, with the odd wastage entry.
      const mat = mats[0];
      const qty = Math.max(1, Math.round(taxableN / mats.length / RATE[mat]));
      const rate = rupees(RATE[mat]);
      const receiptDate = addDays(invoiceDate, -2);
      db.stockTransactions.push({ ...meta(`st_${proj.key}_${i + 1}_r`), siteId, projectId: proj.id, materialId: mat, type: "RECEIPT", quantity: qty.toFixed(3), rate, date: receiptDate });
      const used = Math.round(qty * rng.float(0.5, 0.85));
      db.stockTransactions.push({ ...meta(`st_${proj.key}_${i + 1}_c`), siteId, projectId: proj.id, materialId: mat, type: "CONSUMPTION", quantity: used.toFixed(3), rate, date: addDays(receiptDate, rng.int(2, 6)) });
      if (rng.chance(0.4)) {
        db.stockTransactions.push({ ...meta(`st_${proj.key}_${i + 1}_w`), siteId, projectId: proj.id, materialId: mat, type: "WASTAGE", quantity: Math.max(1, Math.round(qty * 0.02)).toFixed(3), rate, date: addDays(receiptDate, 4) });
      }
    });

    // One open PO per project (committed cost, goods not fully received).
    const openAmount = Math.round(budgetRupees(proj, "ec_materials") * 0.06);
    const openReq = addRequest(proj, proj.siteIds[0], [materials[0]], openAmount, "ORDERED", dayOffset(-4));
    addPo(proj, openReq, vendors[0], proj.siteIds[0], openAmount, dayOffset(-6), rng.chance(0.5) ? "PARTLY_RECEIVED" : "APPROVED");
  });

  // ---- Items that need attention (site requests waiting, one PO awaiting the Director) ----
  const byKey = (k: string) => projects.find((p) => p.key === k)!;
  addRequest(byKey("korba_road"), "site_korba_road_1", ["mat_bitumen"], 1140000, "PENDING_APPROVAL", dayOffset(6), "pm_korba1");
  addRequest(byKey("mh_school"), "site_mh_school_1", ["mat_steel"], 880000, "PENDING_APPROVAL", dayOffset(5), "pm_mh");
  addRequest(byKey("del_drain"), "site_del_drain_1", ["mat_rmc"], 640000, "PENDING_APPROVAL", dayOffset(7), "pm_delhi");
  addRequest(byKey("korba_pipe"), "site_korba_pipe_1", ["mat_pipe"], 1800000, "APPROVED", dayOffset(9), "pm_korba2");
  addRequest(byKey("del_road"), "site_del_road_1", ["mat_agg20"], 320000, "DRAFT", dayOffset(12));
  addRequest(byKey("korba_hall"), "site_korba_hall_1", ["mat_brick"], 260000, "REJECTED", dayOffset(8), "pm_korba2");
  addPo(byKey("mh_school"), null, "5", "site_mh_school_1", 2200000, dayOffset(-1), "PENDING_APPROVAL", userId("director"));
}
