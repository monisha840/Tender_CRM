import { daysBetween, getToday, addDays } from "@/lib/dates";
import { moneyToNumber, subMoney, sumMoney } from "@/lib/money";
import type { BillStatus, IsoDate, Money, VendorInvoiceStatus } from "@/types";

/**
 * One definition per figure. Finance screens, the dashboard and project/party pages all import
 * from here, so the same data always produces the same number. Change a rule here, nowhere else.
 */

// ---- Soft delete (B11) -----------------------------------------------------------------------
/**
 * Every total, count and summary ignores soft-deleted rows (`deletedAt` set). Business records are
 * never hard-deleted, so every aggregate must filter through this.
 */
export const isLive = (row: { deletedAt?: string | null }): boolean => !row.deletedAt;

// ---- Receivables ageing (B9) -----------------------------------------------------------------
/**
 * Ageing = days PAST THE PAYMENT DUE DATE (not days since the invoice date), counted only while
 * an amount is outstanding. Buckets: 0–30, 31–60, 61–90, 90+. An invoice that is not yet due has
 * 0 days past due and sits in "0–30". Used by the Finance receivables tab and the dashboard.
 */
export const AGEING_BUCKETS = ["0–30", "31–60", "61–90", "90+"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

/** Days past due; 0 when not yet due. */
export const daysPastDue = (dueDate: IsoDate, asOf: IsoDate = getToday()): number => Math.max(0, daysBetween(dueDate, asOf));

export const ageingBucketOf = (daysPast: number): AgeingBucket =>
  daysPast <= 30 ? "0–30" : daysPast <= 60 ? "31–60" : daysPast <= 90 ? "61–90" : "90+";

/** Outstanding amount and count per ageing bucket (amount in rupees, for charts). Always returns all four buckets. */
export function ageingTotals<T>(rows: readonly T[], daysPast: (r: T) => number, outstanding: (r: T) => Money) {
  return AGEING_BUCKETS.map((bucket) => {
    const inBucket = rows.filter((r) => ageingBucketOf(daysPast(r)) === bucket);
    return { bucket, count: inBucket.length, amount: moneyToNumber(sumMoney(inBucket.map(outstanding))) };
  });
}

// ---- Payables: subcontractor bills and vendor invoices (B10) ---------------------------------
/**
 * A bill counts toward what we owe ("payable" / "balance") only once approved, until it is fully paid:
 *   subcontractor bill: APPROVED, PARTLY_PAID (PAID has no balance)
 *   vendor invoice:     APPROVED, PARTLY_PAID (RECEIVED is awaiting approval and does not count)
 * DRAFT, SUBMITTED (awaiting approval) and REJECTED bills are never payable. Soft-deleted bills never count.
 * The same statuses drive the dashboard, the Finance payables tab and subcontractor balances.
 */
export const PAYABLE_SUB_BILL_STATUSES: readonly BillStatus[] = ["APPROVED", "PARTLY_PAID"];
export const PAYABLE_VENDOR_INVOICE_STATUSES: readonly VendorInvoiceStatus[] = ["APPROVED", "PARTLY_PAID"];

/** Subcontractor bills that are real liabilities: approved or later (paid included) and not deleted. Rejected never count. */
const APPROVED_SUB_BILL_STATUSES: readonly BillStatus[] = ["APPROVED", "PARTLY_PAID", "PAID"];

export const isApprovedSubBill = (b: { status: BillStatus; deletedAt?: string | null }): boolean =>
  isLive(b) && APPROVED_SUB_BILL_STATUSES.includes(b.status);

export const isPayableSubBill = (b: { status: BillStatus; deletedAt?: string | null }): boolean =>
  isLive(b) && PAYABLE_SUB_BILL_STATUSES.includes(b.status);

export const isPayableVendorInvoice = (i: { status: VendorInvoiceStatus; deletedAt?: string | null }): boolean =>
  isLive(i) && PAYABLE_VENDOR_INVOICE_STATUSES.includes(i.status);

/** Bills awaiting approval (submitted, not rejected or deleted). */
export const isBillAwaitingApproval = (b: { status: BillStatus; deletedAt?: string | null }): boolean => isLive(b) && b.status === "SUBMITTED";

/** Subcontractor billed value = gross amount, before GST and deductions, on non-rejected, non-draft bills. */
export const isBilledSubBill = (b: { status: BillStatus; deletedAt?: string | null }): boolean =>
  isLive(b) && b.status !== "REJECTED" && b.status !== "DRAFT";

/** Net payable less paid, never negative. */
export const balanceOf = (net: Money, paid: Money): Money => {
  const b = subMoney(net, paid);
  return moneyToNumber(b) > 0 ? b : "0.00";
};

/** Subcontractor payment terms: bill date + 30 days. */
export const SUB_BILL_PAYMENT_TERM_DAYS = 30;
export const subBillDueDate = (billDate: IsoDate): IsoDate => addDays(billDate, SUB_BILL_PAYMENT_TERM_DAYS);
export const subBillDaysOverdue = (billDate: IsoDate, asOf: IsoDate = getToday()): number => daysPastDue(subBillDueDate(billDate), asOf);

// ---- "Billed" (B24) --------------------------------------------------------------------------
/**
 * BILLED = taxable value of invoices, EXCLUDING GST. Used for project billed, dashboard billed,
 * revenue and subcontractor billed (gross before GST). GST-inclusive amounts are labelled
 * "invoiced incl. GST" and are only used for what the customer owes (receivables, outstanding).
 */
export const BILLED_LABEL = "Billed (excl. GST)";
export const INVOICED_INCL_GST_LABEL = "Invoiced (incl. GST)";

// ---- Employee count (B24) --------------------------------------------------------------------
/**
 * HEADCOUNT = every live (not soft-deleted) employee, directors and office staff included.
 * ON PAYROLL = headcount members with a wage above zero (directors without a salary are not).
 * Always label which of the two a number is.
 */
export const HEADCOUNT_LABEL = "Headcount (incl. directors)";
export const ON_PAYROLL_LABEL = "On payroll (wage above zero)";
export const isOnPayroll = (profile: { wageAmount: Money } | null | undefined): boolean => moneyToNumber(profile?.wageAmount ?? "0.00") > 0;
