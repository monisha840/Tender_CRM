import type { BaseEntity, Id, IsoDate, Money, Percent } from "./common";

export type InvoiceType = "MONTHLY" | "MILESTONE" | "FINAL";
export type InvoicePaymentStatus = "UNPAID" | "PARTLY_PAID" | "PAID";
/** GSTR-1 style filing state of the supply. */
export type GstFilingStatus = "PENDING" | "FILED";

/**
 * Outward GST tax invoice to a customer organisation. Replaces the old RA bill: monthly invoices
 * for service contracts, milestone invoices for fixed-scope jobs.
 */
export interface Invoice extends BaseEntity {
  /** Our GSTIN (the registration the invoice is issued under). */
  gstRegistrationId: Id;
  invoiceNo: string;
  invoiceDate: IsoDate;
  /** Customer organisation. */
  organisationId: Id;
  /** Customer's GSTIN for the place of supply. */
  customerGstin: string;
  projectId: Id;
  regionId: Id;
  invoiceType: InvoiceType;
  periodFrom: IsoDate;
  periodTo: IsoDate;
  taxableValue: Money;
  cgst: Money;
  sgst: Money;
  igst: Money;
  /** Taxable value plus all taxes. */
  total: Money;
  /** TDS, retention and other amounts the customer withholds. */
  totalDeductions: Money;
  /** What the customer is expected to pay: total less deductions. */
  netReceivable: Money;
  receivedAmount: Money;
  /** Payment due date (invoice date + project payment terms). */
  dueDate: IsoDate;
  paymentStatus: InvoicePaymentStatus;
  gstFilingStatus: GstFilingStatus;
  /** Acknowledgement/ARN once filed. */
  filingReference?: string | null;
  /** Statutory filing due date (11th of the following month). */
  gstFilingDueDate: IsoDate;
}

export interface InvoiceDeduction extends BaseEntity {
  invoiceId: Id;
  deductionTypeId: Id;
  amount: Money;
}

export type PaymentDirection = "IN" | "OUT";
export type PaymentPurpose =
  | "INVOICE_RECEIPT"
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
  organisationId?: Id | null;
  /** Exactly one allocation target is typically set. */
  invoiceId?: Id | null;
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
  invoiceId?: Id | null;
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
