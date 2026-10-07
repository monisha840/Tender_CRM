/**
 * Server-only loader: parties / subcontractors / vendors / work orders / bills / deductions / payments
 * from Postgres into the same `Database` table shapes the pure functions in src/lib/data read.
 *
 * Mapping: Decimal(14,2) -> money string, Decimal(7,4) -> percent string, @db.Date -> "YYYY-MM-DD",
 * DateTime -> ISO string, enums pass through (identical string unions). Soft-deleted rows are excluded
 * unless `scope.includeDeleted`.
 *
 * Scope: work orders, bills and payments are filtered by regionId / projectId (AND). Bill deductions follow
 * the loaded bills. Party / subcontractor / vendor masters are global (not region-scoped).
 * Bank accounts are sensitive: only loaded with `includeBankAccounts` (caller must mask for non-paying roles).
 * `workOrders` is the subcontractor <-> project assignment junction.
 */
import type { PrismaClient } from "@prisma/client";
import type { Database } from "@/types/database";
import {
  base,
  inIds,
  isoDate,
  isoDateOrNull,
  liveWhere,
  money,
  percent,
  type DecimalLike,
  type BaseRow,
  type LoadScope,
} from "./convert-platform";

type Dec = DecimalLike;

export interface PartyBankAccountRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  partyId: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  isPrimary: boolean;
}

export type PartiesSlice = Pick<
  Database,
  | "parties"
  | "subcontractors"
  | "vendors"
  | "workOrders"
  | "subcontractorBills"
  | "subcontractorBillDeductions"
  | "payments"
> & { partyBankAccounts?: PartyBankAccountRecord[] };

export interface LoadPartiesOptions {
  includeBankAccounts?: boolean;
}

// ---- Row shapes (structural subsets of the Prisma models) ------------------

export interface PartyRow extends BaseRow {
  name: string;
  gstin: string | null;
  pan: string;
  address: string;
  stateId: string;
  contactName: string;
  phone: string;
  email: string | null;
  isActive: boolean;
}
export interface BankRow extends BaseRow {
  partyId: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  isPrimary: boolean;
}
export interface SubcontractorRow extends BaseRow {
  partyId: string;
  tradeCategory: string;
  isLabourSupplier: boolean;
  status: "ACTIVE" | "INACTIVE" | "BLACKLISTED";
}
export interface VendorRow extends BaseRow {
  partyId: string;
  category: string;
  isActive: boolean;
}
export interface WorkOrderRow extends BaseRow {
  subcontractorId: string;
  projectId: string;
  siteId: string | null;
  regionId: string;
  workOrderNo: string;
  trade: string;
  scope: string;
  progressPercent: Dec;
  contractValue: Dec;
  startDate: Date;
  endDate: Date | null;
  retentionPercent: Dec;
  status: "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";
}
export interface BillRow extends BaseRow {
  workOrderId: string;
  subcontractorId: string;
  projectId: string;
  regionId: string;
  gstRegistrationId: string;
  billNo: string;
  billDate: Date;
  periodFrom: Date;
  periodTo: Date;
  grossAmount: Dec;
  gstAmount: Dec;
  totalDeductions: Dec;
  netPayable: Dec;
  paidAmount: Dec;
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PARTLY_PAID" | "PAID";
  approvalRequestId: string | null;
}
export interface BillDeductionRow extends BaseRow {
  billId: string;
  deductionTypeId: string;
  amount: Dec;
  remarks: string | null;
}
export interface PaymentRow extends BaseRow {
  direction: "IN" | "OUT";
  purpose: Database["payments"][number]["purpose"];
  amount: Dec;
  paidOn: Date;
  mode: Database["payments"][number]["mode"];
  utr: string | null;
  regionId: string;
  projectId: string | null;
  gstRegistrationId: string | null;
  partyId: string | null;
  organisationId: string | null;
  invoiceId: string | null;
  subcontractorBillId: string | null;
  vendorInvoiceId: string | null;
  securityInstrumentId: string | null;
  remarks: string | null;
}

// ---- Pure mappers -----------------------------------------------------------

export const mapParty = (r: PartyRow): Database["parties"][number] => ({
  ...base(r),
  name: r.name,
  gstin: r.gstin,
  pan: r.pan,
  address: r.address,
  stateId: r.stateId,
  contactName: r.contactName,
  phone: r.phone,
  email: r.email,
  isActive: r.isActive,
});

export const mapBankAccount = (r: BankRow): PartyBankAccountRecord => ({
  ...base(r),
  partyId: r.partyId,
  bankName: r.bankName,
  accountNumber: r.accountNumber,
  ifsc: r.ifsc,
  isPrimary: r.isPrimary,
});

export const mapSubcontractor = (r: SubcontractorRow): Database["subcontractors"][number] => ({
  ...base(r),
  partyId: r.partyId,
  tradeCategory: r.tradeCategory,
  isLabourSupplier: r.isLabourSupplier,
  status: r.status,
});

export const mapVendor = (r: VendorRow): Database["vendors"][number] => ({
  ...base(r),
  partyId: r.partyId,
  category: r.category,
  isActive: r.isActive,
});

export const mapWorkOrder = (r: WorkOrderRow): Database["workOrders"][number] => ({
  ...base(r),
  subcontractorId: r.subcontractorId,
  projectId: r.projectId,
  siteId: r.siteId,
  regionId: r.regionId,
  workOrderNo: r.workOrderNo,
  trade: r.trade,
  scope: r.scope,
  progressPercent: percent(r.progressPercent),
  contractValue: money(r.contractValue),
  startDate: isoDate(r.startDate),
  endDate: isoDateOrNull(r.endDate),
  retentionPercent: percent(r.retentionPercent),
  status: r.status,
});

export const mapBill = (r: BillRow): Database["subcontractorBills"][number] => ({
  ...base(r),
  workOrderId: r.workOrderId,
  subcontractorId: r.subcontractorId,
  projectId: r.projectId,
  regionId: r.regionId,
  gstRegistrationId: r.gstRegistrationId,
  billNo: r.billNo,
  billDate: isoDate(r.billDate),
  periodFrom: isoDate(r.periodFrom),
  periodTo: isoDate(r.periodTo),
  grossAmount: money(r.grossAmount),
  gstAmount: money(r.gstAmount),
  totalDeductions: money(r.totalDeductions),
  netPayable: money(r.netPayable),
  paidAmount: money(r.paidAmount),
  status: r.status,
  approvalRequestId: r.approvalRequestId,
});

export const mapBillDeduction = (r: BillDeductionRow): Database["subcontractorBillDeductions"][number] => ({
  ...base(r),
  billId: r.billId,
  deductionTypeId: r.deductionTypeId,
  amount: money(r.amount),
  remarks: r.remarks,
});

export const mapPayment = (r: PaymentRow): Database["payments"][number] => ({
  ...base(r),
  direction: r.direction,
  purpose: r.purpose,
  amount: money(r.amount),
  paidOn: isoDate(r.paidOn),
  mode: r.mode,
  utr: r.utr,
  regionId: r.regionId,
  projectId: r.projectId,
  gstRegistrationId: r.gstRegistrationId,
  partyId: r.partyId,
  organisationId: r.organisationId,
  invoiceId: r.invoiceId,
  subcontractorBillId: r.subcontractorBillId,
  vendorInvoiceId: r.vendorInvoiceId,
  securityInstrumentId: r.securityInstrumentId,
  remarks: r.remarks,
});

// ---- Loader -----------------------------------------------------------------

export async function loadParties(
  prisma: PrismaClient,
  scope?: LoadScope,
  options: LoadPartiesOptions = {},
): Promise<PartiesSlice> {
  const live = liveWhere(scope);
  const regionId = inIds(scope?.regionIds);
  const projectId = inIds(scope?.projectIds);
  const scoped = { ...live, regionId, projectId };

  const [parties, subcontractors, vendors, workOrders, bills, payments, banks] = await Promise.all([
    prisma.party.findMany({ where: live, orderBy: { name: "asc" } }),
    prisma.subcontractor.findMany({ where: live }),
    prisma.vendor.findMany({ where: live }),
    prisma.subcontractorWorkOrder.findMany({ where: scoped, orderBy: { workOrderNo: "asc" } }),
    prisma.subcontractorBill.findMany({ where: scoped, orderBy: [{ billDate: "asc" }, { billNo: "asc" }] }),
    prisma.payment.findMany({ where: scoped, orderBy: { paidOn: "asc" } }),
    options.includeBankAccounts ? prisma.partyBankAccount.findMany({ where: live }) : Promise.resolve(undefined),
  ]);

  const billIds = bills.map((b) => b.id);
  const deductions = await prisma.subcontractorBillDeduction.findMany({
    where: { ...live, billId: { in: billIds } },
  });

  const slice: PartiesSlice = {
    parties: parties.map(mapParty),
    subcontractors: subcontractors.map(mapSubcontractor),
    vendors: vendors.map(mapVendor),
    workOrders: workOrders.map(mapWorkOrder),
    subcontractorBills: bills.map(mapBill),
    subcontractorBillDeductions: deductions.map(mapBillDeduction),
    payments: payments.map(mapPayment),
  };
  if (banks) slice.partyBankAccounts = banks.map(mapBankAccount);
  return slice;
}
