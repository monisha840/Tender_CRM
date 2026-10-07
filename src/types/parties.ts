import type { BaseEntity, Id, IsoDate, Money, Percent } from "./common";

/** Shared master for external legal entities. One entity can be both vendor and subcontractor. */
export interface Party extends BaseEntity {
  name: string;
  gstin?: string | null;
  pan: string;
  address: string;
  stateId: Id;
  contactName: string;
  phone: string;
  email?: string | null;
  isActive: boolean;
}

export type SubcontractorStatus = "ACTIVE" | "INACTIVE" | "BLACKLISTED";

export interface Subcontractor extends BaseEntity {
  partyId: Id;
  tradeCategory: string;
  isLabourSupplier: boolean;
  status: SubcontractorStatus;
}

export interface Vendor extends BaseEntity {
  partyId: Id;
  category: string;
  isActive: boolean;
}

export type WorkOrderStatus = "DRAFT" | "ACTIVE" | "COMPLETED" | "CANCELLED";

/** The explicit subcontractor <-> project junction: A -> Project 1, 4, 7 is DISTINCT projectId here. */
export interface SubcontractorWorkOrder extends BaseEntity {
  subcontractorId: Id;
  projectId: Id;
  siteId?: Id | null;
  regionId: Id;
  workOrderNo: string;
  /** Assigned work, as a trade: "Civil", "Stone Picking", "Painting"… */
  trade: string;
  scope: string;
  /** Physical progress of the assigned work, 0–100. Billed, paid, balance and payment date are derived from bills. */
  progressPercent: Percent;
  contractValue: Money;
  startDate: IsoDate;
  endDate?: IsoDate | null;
  retentionPercent: Percent;
  status: WorkOrderStatus;
}

/** Shared by subcontractor bills and RA bills (config table, not an enum). */
export interface DeductionType extends BaseEntity {
  code: string;
  name: string;
  calcMethod: "PERCENT" | "FIXED" | "MANUAL";
  defaultRate?: Percent | null;
  appliesTo: "SUB_BILL" | "RA_BILL" | "BOTH";
  isReleasable: boolean;
}

export type BillStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "PARTLY_PAID" | "PAID";

export interface SubcontractorBill extends BaseEntity {
  workOrderId: Id;
  subcontractorId: Id;
  projectId: Id;
  regionId: Id;
  gstRegistrationId: Id;
  billNo: string;
  billDate: IsoDate;
  periodFrom: IsoDate;
  periodTo: IsoDate;
  grossAmount: Money;
  gstAmount: Money;
  totalDeductions: Money;
  netPayable: Money;
  paidAmount: Money;
  status: BillStatus;
  approvalRequestId?: Id | null;
}

export interface SubcontractorBillDeduction extends BaseEntity {
  billId: Id;
  deductionTypeId: Id;
  amount: Money;
  remarks?: string | null;
}
