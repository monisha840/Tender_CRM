// Server-only. Prisma -> `Database` slice for accounts, GST, purchases and stock.
// See row-mapper.ts for the Decimal/Date conversion and soft-delete conventions.
import type { PrismaClient } from "@prisma/client";
import type {
  Database,
  GstTransaction,
  Invoice,
  InvoiceDeduction,
  Payment,
  PurchaseOrder,
  PurchaseRequest,
  PurchaseRequestItem,
  RetentionEntry,
  StockTransaction,
  VendorInvoice,
} from "@/types";
import { byProject, byRegion, live, mapRow, type LoadScope, type RowSpec } from "./row-mapper";

export type FinanceSlice = Pick<
  Database,
  | "invoices"
  | "invoiceDeductions"
  | "payments"
  | "retentionEntries"
  | "gstTransactions"
  | "purchaseRequests"
  | "purchaseRequestItems"
  | "purchaseOrders"
  | "vendorInvoices"
  | "stockTransactions"
>;

export const invoiceSpec: RowSpec = {
  str: ["gstRegistrationId", "invoiceNo", "organisationId", "customerGstin", "projectId", "regionId", "invoiceType", "paymentStatus", "gstFilingStatus", "filingReference"],
  money: ["taxableValue", "cgst", "sgst", "igst", "total", "totalDeductions", "netReceivable", "receivedAmount"],
  date: ["invoiceDate", "periodFrom", "periodTo", "dueDate", "gstFilingDueDate"],
  optional: ["filingReference"],
};
export const invoiceDeductionSpec: RowSpec = { str: ["invoiceId", "deductionTypeId"], money: ["amount"] };
export const paymentSpec: RowSpec = {
  str: ["direction", "purpose", "mode", "utr", "regionId", "projectId", "gstRegistrationId", "partyId", "organisationId", "invoiceId", "subcontractorBillId", "vendorInvoiceId", "securityInstrumentId", "remarks"],
  money: ["amount"],
  date: ["paidOn"],
  optional: ["utr", "projectId", "gstRegistrationId", "partyId", "organisationId", "invoiceId", "subcontractorBillId", "vendorInvoiceId", "securityInstrumentId", "remarks"],
};
export const retentionSpec: RowSpec = {
  str: ["side", "projectId", "workOrderId", "invoiceId", "type"],
  money: ["amount"],
  date: ["date"],
  optional: ["workOrderId", "invoiceId"],
};
export const gstTransactionSpec: RowSpec = {
  str: ["gstRegistrationId", "direction", "sourceType", "sourceId", "partyName", "partyGstin", "invoiceNo", "period"],
  bool: ["itcEligible"],
  money: ["taxableValue", "cgst", "sgst", "igst"],
  pct: ["rate"],
  date: ["invoiceDate"],
  optional: ["partyGstin"],
};
export const purchaseRequestSpec: RowSpec = {
  str: ["requestNo", "projectId", "siteId", "regionId", "requestedById", "status", "approvalRequestId"],
  money: ["estimatedAmount"],
  date: ["neededBy"],
  optional: ["approvalRequestId"],
};
/** `quantity` is a string with 3 decimals in the seed shape. */
export const purchaseRequestItemSpec: RowSpec = { str: ["requestId", "materialId"], qty: ["quantity"] };
export const purchaseOrderSpec: RowSpec = {
  str: ["poNo", "requestId", "vendorId", "projectId", "siteId", "regionId", "gstRegistrationId", "status", "approvalRequestId"],
  money: ["amount", "gstAmount"],
  date: ["poDate"],
  optional: ["requestId", "approvalRequestId"],
};
export const vendorInvoiceSpec: RowSpec = {
  str: ["invoiceNo", "purchaseOrderId", "vendorId", "projectId", "regionId", "gstRegistrationId", "status"],
  bool: ["itcEligible"],
  money: ["taxableValue", "cgst", "sgst", "igst", "total", "paidAmount"],
  date: ["invoiceDate", "dueDate"],
  optional: ["purchaseOrderId"],
};
export const stockTransactionSpec: RowSpec = {
  str: ["siteId", "projectId", "materialId", "type"],
  qty: ["quantity"],
  money: ["rate"],
  date: ["date"],
};

const rows = <T>(list: unknown[], spec: RowSpec): T[] => list.map((r) => mapRow<T>(r as Record<string, unknown>, spec));

/**
 * Loads the finance slice (soft-deleted rows excluded). Region/project scope applies to tables with
 * those columns; deductions and request items are scoped through their parent invoice/request.
 * GST transactions are keyed by GSTIN, not region, so they are not narrowed by scope.
 */
export async function loadFinance(prisma: PrismaClient, scope?: LoadScope): Promise<Partial<Database>> {
  const regionProject = { ...byRegion(scope), ...byProject(scope) };
  const [invoices, payments, retention, gst, requests, orders, vendorInvoices, stock] = await Promise.all([
    prisma.invoice.findMany({ where: { ...live, ...regionProject }, orderBy: { invoiceDate: "asc" } }),
    prisma.payment.findMany({ where: { ...live, ...regionProject }, orderBy: { paidOn: "asc" } }),
    prisma.retentionEntry.findMany({ where: { ...live, ...byProject(scope) }, orderBy: { date: "asc" } }),
    prisma.gstTransaction.findMany({ where: { ...live }, orderBy: { invoiceDate: "asc" } }),
    prisma.purchaseRequest.findMany({ where: { ...live, ...regionProject }, orderBy: { requestNo: "asc" } }),
    prisma.purchaseOrder.findMany({ where: { ...live, ...regionProject }, orderBy: { poNo: "asc" } }),
    prisma.vendorInvoice.findMany({ where: { ...live, ...regionProject }, orderBy: { invoiceDate: "asc" } }),
    prisma.stockTransaction.findMany({ where: { ...live, ...byProject(scope) }, orderBy: { date: "asc" } }),
  ]);
  const [deductions, items] = await Promise.all([
    prisma.invoiceDeduction.findMany({ where: { ...live, invoiceId: { in: invoices.map((i) => i.id) } } }),
    prisma.purchaseRequestItem.findMany({ where: { ...live, requestId: { in: requests.map((r) => r.id) } } }),
  ]);
  const slice: FinanceSlice = {
    invoices: rows<Invoice>(invoices, invoiceSpec),
    invoiceDeductions: rows<InvoiceDeduction>(deductions, invoiceDeductionSpec),
    payments: rows<Payment>(payments, paymentSpec),
    retentionEntries: rows<RetentionEntry>(retention, retentionSpec),
    gstTransactions: rows<GstTransaction>(gst, gstTransactionSpec),
    purchaseRequests: rows<PurchaseRequest>(requests, purchaseRequestSpec),
    purchaseRequestItems: rows<PurchaseRequestItem>(items, purchaseRequestItemSpec),
    purchaseOrders: rows<PurchaseOrder>(orders, purchaseOrderSpec),
    vendorInvoices: rows<VendorInvoice>(vendorInvoices, vendorInvoiceSpec),
    stockTransactions: rows<StockTransaction>(stock, stockTransactionSpec),
  };
  return slice;
}
