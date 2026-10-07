import type { BaseEntity, Id, IsoDate, Money, Percent } from "./common";

export type RaBillType = "RA" | "FINAL" | "ESCALATION" | "SUPPLEMENTARY";
export type RaBillStatus = "DRAFT" | "SUBMITTED" | "CERTIFIED" | "PARTLY_RECEIVED" | "RECEIVED";

/** Running Account bill to the department (docs/system-flow.md §9.1). */
export interface RaBill extends BaseEntity {
  projectId: Id;
  regionId: Id;
  clientId: Id;
  gstRegistrationId: Id;
  billType: RaBillType;
  billNo: string;
  periodFrom: IsoDate;
  periodTo: IsoDate;
  billDate: IsoDate;
  /** This bill's gross. */
  grossAmount: Money;
  /** Cumulative gross up to and including this bill. */
  cumulativeGross: Money;
  gstAmount: Money;
  totalDeductions: Money;
  netPayable: Money;
  receivedAmount: Money;
  /** Expected payment date; overdue when past and not fully received. */
  dueDate: IsoDate;
  status: RaBillStatus;
}

export interface RaBillDeduction extends BaseEntity {
  raBillId: Id;
  deductionTypeId: Id;
  amount: Money;
}

export type PaymentDirection = "IN" | "OUT";
export type PaymentPurpose =
  | "RA_RECEIPT"
  | "EMD"
  | "EMD_REFUND"
  | "PBG"
  | "SALARY"
  | "SUBCONTRACTOR"
  | "VENDOR"
  | "EXPENSE"
  | "TENDER_FEE"
  | "TAX";

export interface Payment extends BaseEntity {
  direction: PaymentDirection;
  purpose: PaymentPurpose;
  amount: Money;
  paidOn: IsoDate;
  mode: "BANK_TRANSFER" | "CHEQUE" | "DD" | "ONLINE" | "CASH";
  utr?: string | null;
  regionId: Id;
  projectId?: Id | null;
  gstRegistrationId?: Id | null;
  partyId?: Id | null;
  clientId?: Id | null;
  /** Exactly one allocation target is typically set. */
  raBillId?: Id | null;
  subcontractorBillId?: Id | null;
  vendorInvoiceId?: Id | null;
  securityInstrumentId?: Id | null;
  remarks?: string | null;
}

export type RetentionSide = "CLIENT" | "SUBCONTRACTOR";

/** Retention withheld/released, tracked from both directions. */
export interface RetentionEntry extends BaseEntity {
  side: RetentionSide;
  projectId: Id;
  workOrderId?: Id | null;
  raBillId?: Id | null;
  type: "WITHHELD" | "RELEASED";
  amount: Money;
  date: IsoDate;
}

export type GstDirection = "OUTWARD" | "INWARD" | "TDS_RECEIVED";

/** Read model; source tables stay authoritative. Feeds per-GSTIN reports. */
export interface GstTransaction extends BaseEntity {
  gstRegistrationId: Id;
  direction: GstDirection;
  sourceType: string;
  sourceId: Id;
  partyName: string;
  partyGstin?: string | null;
  invoiceNo: string;
  invoiceDate: IsoDate;
  /** "YYYY-MM" */
  period: string;
  taxableValue: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  itcEligible: boolean;
  /** Effective GST rate for display. */
  rate: Percent;
}
