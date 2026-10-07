import { addDays, daysBetween } from "@/lib/dates";
import { addMoney, percentOf, subMoney } from "@/lib/money";
import type { Id, Money, VendorInvoiceStatus } from "@/types";
import type { Template } from "./catalog";
import { addApproval } from "./approvals";
import { dayOffset, meta, pad, rupees, StateOf, type RegionKeyName, type SeedCtx } from "./helpers";
import { userId } from "./org";
import { VENDORS } from "./parties";
import { actualRupees, budgetRupees, monthsElapsed, splitRupees } from "./plan";
import type { ProjectInfo } from "./projects";
import { SITE_USER } from "./workforce";

/** Approximate market rates (₹ per unit) used to turn a spend into realistic quantities. */
const RATE: Record<string, number> = {
  mat_primer: 520, mat_pu: 640, mat_grit: 9500, mat_sections: 64000, mat_plate: 62000, mat_cbpipe: 12000, mat_cement: 380, mat_scaffold: 78000, mat_ppe: 1800, mat_electrode: 140,
};
const MATERIALS_BY_TEMPLATE: Record<Template, string[]> = {
  stone: ["mat_ppe"],
  paint: ["mat_primer", "mat_pu", "mat_grit"],
  cbp: ["mat_cbpipe", "mat_sections", "mat_electrode"],
  steel: ["mat_sections", "mat_plate", "mat_electrode"],
  civil: ["mat_cement", "mat_sections"],
  scaff: ["mat_scaffold", "mat_ppe"],
  package: ["mat_cement", "mat_primer", "mat_ppe"],
};
const VENDORS_BY_REGION: Record<RegionKeyName, string[]> = { cg: ["2", "3"], mh: ["4", "5"], south: ["1", "7"], delhi: ["6", "2"] };
const REGION_CODE: Record<RegionKeyName, string> = { cg: "CG", mh: "MH", south: "SO", delhi: "DL" };
const GST_STATE: Record<string, string> = { gst_cg: "st_cg", gst_mh: "st_mh", gst_tn: "st_tn", gst_dl: "st_dl" };

export function seedPurchases(ctx: SeedCtx, projects: ProjectInfo[]) {
  const { db, rng } = ctx;
  let prNo = 0;
  let poNo = 0;

  const addRequest = (proj: ProjectInfo, materialIds: string[], amount: number, status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "ORDERED", neededBy: string, approverUser?: Id) => {
    const id = `pr_${++prNo}`;
    const amountM = rupees(amount);
    db.purchaseRequests.push({
      ...meta(id), requestNo: `PR/${REGION_CODE[proj.regionKey]}/${pad(prNo)}`, projectId: proj.id, siteId: proj.siteId, regionId: proj.regionId,
      requestedById: SITE_USER[proj.regionKey].engineer, neededBy, status, estimatedAmount: amountM,
      approvalRequestId: status === "PENDING_APPROVAL" || status === "REJECTED" ? `apr_${id}` : null,
    });
    materialIds.forEach((m, i) =>
      db.purchaseRequestItems.push({
        ...meta(`pri_${id}_${i + 1}`), requestId: id, materialId: m, quantity: Math.max(1, Math.round(amount / materialIds.length / RATE[m])).toFixed(3),
      }),
    );
    if (status === "PENDING_APPROVAL" || status === "REJECTED") {
      addApproval(ctx, {
        id: `apr_${id}`, entityType: "PURCHASE_REQUEST", entityId: id, amount: amountM, regionId: proj.regionId, projectId: proj.id,
        title: `Purchase request PR/${REGION_CODE[proj.regionKey]}/${pad(prNo)}`, requestedById: SITE_USER[proj.regionKey].engineer,
        approverId: approverUser ?? userId(proj.pmKey), status: status === "REJECTED" ? "REJECTED" : "PENDING", submittedOn: dayOffset(-2), decidedOn: dayOffset(-1),
        comment: status === "REJECTED" ? "Quantity exceeds BOQ requirement; revise." : undefined,
      });
    }
    return id;
  };

  const addPo = (proj: ProjectInfo, requestId: Id | null, vendorKey: string, taxable: number, poDate: string, status: "APPROVED" | "PARTLY_RECEIVED" | "RECEIVED" | "PENDING_APPROVAL", approvalTo?: Id) => {
    const id = `po_${++poNo}`;
    const amount = rupees(taxable);
    const gst = percentOf(amount, 18);
    db.purchaseOrders.push({
      ...meta(id), poNo: `PO/${REGION_CODE[proj.regionKey]}/2026-27/${pad(poNo)}`, requestId, vendorId: `ven_${vendorKey}`, projectId: proj.id, siteId: proj.siteId,
      regionId: proj.regionId, gstRegistrationId: proj.gstId, poDate, amount, gstAmount: gst, status, approvalRequestId: status === "PENDING_APPROVAL" ? `apr_${id}` : null,
    });
    if (status === "PENDING_APPROVAL") {
      addApproval(ctx, {
        id: `apr_${id}`, entityType: "PURCHASE_ORDER", entityId: id, amount: addMoney(amount, gst), regionId: proj.regionId, projectId: proj.id,
        title: `Purchase order PO/${REGION_CODE[proj.regionKey]}/2026-27/${pad(poNo)}`, requestedById: userId(proj.pmKey), approverId: approvalTo ?? userId("stalin"),
        status: "PENDING", submittedOn: dayOffset(-1),
      });
    }
    if (status === "APPROVED" || status === "PARTLY_RECEIVED") {
      db.costEntries.push({
        ...meta(`ce_po_${id}`), projectId: proj.id, siteId: proj.siteId, regionId: proj.regionId, expenseCategoryId: "ec_materials", kind: "COMMITTED",
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
    const overdueProject = ["p2_cspgcl_paint", "p6_ntpc_steel", "p11_iocl_paint"].includes(proj.key);

    parts.forEach((taxableN, i) => {
      const invoiceDate = addDays(first, Math.round((i * span) / (n - 1)));
      const vendorKey = vendors[i % vendors.length];
      const vendor = VENDORS.find((v) => v.id === vendorKey)!;
      const interstate = StateOf[vendor.region] !== GST_STATE[proj.gstId];
      const mats = materials.length > 1 ? [materials[i % materials.length], materials[(i + 1) % materials.length]] : [materials[0]];
      const reqId = addRequest(proj, mats, taxableN, "ORDERED", addDays(invoiceDate, -5));
      const poId = addPo(proj, reqId, vendorKey, taxableN, addDays(invoiceDate, -10), "RECEIVED");

      const taxable = rupees(taxableN);
      const gst = percentOf(taxable, 18);
      const half = percentOf(gst, 50);
      const total = addMoney(taxable, gst);
      const fromNewest = n - 1 - i;
      let status: VendorInvoiceStatus = fromNewest === 0 ? "RECEIVED" : fromNewest === 1 && i % 2 === 1 ? "PARTLY_PAID" : "PAID";
      if (overdueProject && fromNewest === 1) status = "APPROVED"; // approved, due date passed, not yet paid
      const paid: Money = status === "PAID" ? total : status === "PARTLY_PAID" ? percentOf(total, 50) : "0.00";
      const id = `vinv_${proj.key}_${i + 1}`;
      const itc = !(proj.key === "p7_mppgcl_civil" && i === 0); // one invoice with blocked credit, to exercise the filter
      const invoiceNo = `INV-${rng.int(1000, 9999)}/${rng.int(25, 26)}`;

      db.vendorInvoices.push({
        ...meta(id), invoiceNo, purchaseOrderId: poId, vendorId: `ven_${vendorKey}`, projectId: proj.id, regionId: proj.regionId, gstRegistrationId: proj.gstId,
        invoiceDate, dueDate: addDays(invoiceDate, 30), taxableValue: taxable, cgst: interstate ? "0.00" : half, sgst: interstate ? "0.00" : subMoney(gst, half),
        igst: interstate ? gst : "0.00", total, paidAmount: paid, itcEligible: itc, status,
      });
      if (paid !== "0.00") {
        db.payments.push({
          ...meta(`pay_vi_${proj.key}_${i + 1}`), direction: "OUT", purpose: "VENDOR", amount: paid, paidOn: addDays(invoiceDate, status === "PAID" ? 24 : 28), mode: "BANK_TRANSFER",
          utr: `UTR${rng.int(100000000, 999999999)}`, regionId: proj.regionId, projectId: proj.id, gstRegistrationId: proj.gstId, partyId: `party_ven_${vendorKey}`, vendorInvoiceId: id, remarks: null,
        });
      }
      db.costEntries.push({
        ...meta(`ce_vi_${proj.key}_${i + 1}`), projectId: proj.id, siteId: proj.siteId, regionId: proj.regionId, expenseCategoryId: "ec_materials", kind: "ACTUAL",
        sourceType: "VENDOR_INVOICE", sourceId: id, amount: taxable, date: invoiceDate,
      });
      db.gstTransactions.push({
        ...meta(`gst_vi_${proj.key}_${i + 1}`), gstRegistrationId: proj.gstId, direction: "INWARD", sourceType: "VENDOR_INVOICE", sourceId: id, partyName: vendor.name, partyGstin: vendor.gstin,
        invoiceNo, invoiceDate, period: invoiceDate.slice(0, 7), taxableValue: taxable, cgst: interstate ? "0.00" : half, sgst: interstate ? "0.00" : subMoney(gst, half),
        igst: interstate ? gst : "0.00", itcEligible: itc, rate: "18.0000",
      });

      // Site stock: goods received, then partly consumed, with the odd wastage entry.
      const mat = mats[0];
      const qty = Math.max(1, Math.round(taxableN / mats.length / RATE[mat]));
      const rate = rupees(RATE[mat]);
      const receiptDate = addDays(invoiceDate, -2);
      db.stockTransactions.push({ ...meta(`st_${proj.key}_${i + 1}_r`), siteId: proj.siteId, projectId: proj.id, materialId: mat, type: "RECEIPT", quantity: qty.toFixed(3), rate, date: receiptDate });
      const used = Math.round(qty * rng.float(0.5, 0.85));
      db.stockTransactions.push({ ...meta(`st_${proj.key}_${i + 1}_c`), siteId: proj.siteId, projectId: proj.id, materialId: mat, type: "CONSUMPTION", quantity: used.toFixed(3), rate, date: addDays(receiptDate, rng.int(2, 6)) });
      if (rng.chance(0.4)) {
        db.stockTransactions.push({ ...meta(`st_${proj.key}_${i + 1}_w`), siteId: proj.siteId, projectId: proj.id, materialId: mat, type: "WASTAGE", quantity: Math.max(1, Math.round(qty * 0.02)).toFixed(3), rate, date: addDays(receiptDate, 4) });
      }
    });

    // One open PO per project (committed cost, goods not fully received).
    const openAmount = Math.round(budgetRupees(proj, "ec_materials") * 0.06);
    const openReq = addRequest(proj, [materials[0]], openAmount, "ORDERED", dayOffset(-4));
    addPo(proj, openReq, vendors[0], openAmount, dayOffset(-6), rng.chance(0.5) ? "PARTLY_RECEIVED" : "APPROVED");
  });

  // ---- Items that need attention (site requests waiting, one PO awaiting the CMD) ----
  const byKey = (k: string) => projects.find((p) => p.key === k)!;
  addRequest(byKey("p6_ntpc_steel"), ["mat_plate"], 1240000, "PENDING_APPROVAL", dayOffset(6));
  addRequest(byKey("p2_cspgcl_paint"), ["mat_primer"], 540000, "PENDING_APPROVAL", dayOffset(5));
  addRequest(byKey("p11_iocl_paint"), ["mat_ppe"], 160000, "PENDING_APPROVAL", dayOffset(7));
  addRequest(byKey("p5_tangedco_scaff"), ["mat_scaffold"], 780000, "APPROVED", dayOffset(9));
  addRequest(byKey("p10_kpcl_pkg"), ["mat_cement"], 120000, "DRAFT", dayOffset(12));
  addRequest(byKey("p7_mppgcl_civil"), ["mat_cement"], 190000, "REJECTED", dayOffset(8));
  addPo(byKey("p3_mspgcl_cbp"), null, "5", 2200000, dayOffset(-1), "PENDING_APPROVAL", userId("stalin"));
}
