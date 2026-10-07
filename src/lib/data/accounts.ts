import { daysBetween, getToday } from "@/lib/dates";
import { hasOutstanding, moneyToNumber, outstandingMoney, subMoney, sumMoney } from "@/lib/money";
import type { Database, GstFilingStatus, Id, Invoice, InvoicePaymentStatus, Money, Payment } from "@/types";
import { ageingTotals, daysPastDue, isLive, isPayableSubBill, isPayableVendorInvoice, subBillDueDate } from "./definitions";
import { byId, inRegion, organisationName, sum, type RegionFilter } from "./shared";

export interface InvoiceRow {
  invoice: Invoice;
  projectName: string;
  organisationName: string;
  /** Net receivable not yet received. */
  outstanding: Money;
  /** Days past the payment due date (the ageing definition, see definitions.ts); 0 when not yet due or fully paid. */
  daysOverdue: number;
  /** Days past the GST filing due date while still pending; 0 otherwise. */
  filingDaysOverdue: number;
}

export interface InvoiceFilters {
  region?: RegionFilter;
  projectId?: Id;
  paymentStatus?: InvoicePaymentStatus;
  gstFilingStatus?: GstFilingStatus;
  /** "YYYY-MM" of the invoice date. */
  period?: string;
}

export function listInvoices(db: Database, filters: InvoiceFilters = {}): InvoiceRow[] {
  const today = getToday();
  return db.invoices
    .filter((i) => !i.deletedAt && inRegion(filters.region ?? "ALL", i.regionId))
    .filter((i) => !filters.projectId || i.projectId === filters.projectId)
    .filter((i) => !filters.paymentStatus || i.paymentStatus === filters.paymentStatus)
    .filter((i) => !filters.gstFilingStatus || i.gstFilingStatus === filters.gstFilingStatus)
    .filter((i) => !filters.period || i.invoiceDate.startsWith(filters.period))
    .map((invoice): InvoiceRow => {
      const outstanding = outstandingMoney(invoice.netReceivable, invoice.receivedAmount);
      return {
        invoice,
        projectName: byId(db.projects, invoice.projectId)?.name ?? "—",
        organisationName: organisationName(db, invoice.organisationId),
        outstanding,
        daysOverdue: hasOutstanding(invoice.netReceivable, invoice.receivedAmount) ? daysPastDue(invoice.dueDate, today) : 0,
        filingDaysOverdue: invoice.gstFilingStatus === "PENDING" ? Math.max(0, daysBetween(invoice.gstFilingDueDate, today)) : 0,
      };
    })
    .sort((a, b) => b.invoice.invoiceDate.localeCompare(a.invoice.invoiceDate) || a.invoice.invoiceNo.localeCompare(b.invoice.invoiceNo));
}

/** Unpaid or part-paid invoices, most overdue first. */
export function listReceivables(db: Database, region: RegionFilter = "ALL"): InvoiceRow[] {
  return listInvoices(db, { region })
    .filter((r) => hasOutstanding(r.invoice.netReceivable, r.invoice.receivedAmount))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function getReceivablesSummary(db: Database, region: RegionFilter = "ALL") {
  const rows = listReceivables(db, region);
  const overdue = rows.filter((r) => r.daysOverdue > 0);
  return {
    total: sumMoney(rows.map((r) => r.outstanding)),
    overdue: sumMoney(overdue.map((r) => r.outstanding)),
    overdueCount: overdue.length,
    /** Outstanding by days past due: 0–30, 31–60, 61–90, 90+ (one definition for Finance and dashboard). */
    ageing: ageingTotals(rows, (r) => r.daysOverdue, (r) => r.outstanding),
    rows,
  };
}

/**
 * Billing and payment totals for one project, from its live invoices.
 * `billed` is the taxable value, EXCLUDING GST (the one "billed" definition); `invoicedTotal` is incl. GST.
 */
export function getProjectBilling(db: Database, projectId: Id) {
  const invoices = db.invoices.filter((i) => isLive(i) && i.projectId === projectId);
  const billed = sumMoney(invoices.map((i) => i.taxableValue));
  return {
    invoiceCount: invoices.length,
    billed,
    invoicedTaxable: billed,
    invoicedTotal: sumMoney(invoices.map((i) => i.total)),
    received: sumMoney(invoices.map((i) => i.receivedAmount)),
    outstanding: sumMoney(invoices.map((i) => outstandingMoney(i.netReceivable, i.receivedAmount))),
    lastInvoiceDate: invoices.map((i) => i.invoiceDate).sort().pop() ?? null,
  };
}

/** GST filing position across invoices: filed, pending and overdue counts. */
export function getGstFilingSummary(db: Database, region: RegionFilter = "ALL") {
  const rows = listInvoices(db, { region });
  const pending = rows.filter((r) => r.invoice.gstFilingStatus === "PENDING");
  return {
    filed: rows.length - pending.length,
    pending: pending.length,
    overdue: pending.filter((r) => r.filingDaysOverdue > 0).length,
    rows: pending.sort((a, b) => a.invoice.gstFilingDueDate.localeCompare(b.invoice.gstFilingDueDate)),
  };
}

export interface PayableRow {
  kind: "VENDOR_INVOICE" | "SUBCONTRACTOR_BILL";
  id: string;
  party: string;
  projectName: string;
  outstanding: Money;
  dueDate: string;
  daysOverdue: number;
}

/** Approved vendor invoices and approved subcontractor bills not yet fully paid (see definitions.ts). */
export function listPayables(db: Database, region: RegionFilter = "ALL"): PayableRow[] {
  const today = getToday();
  const partyOf = (partyId: string) => byId(db.parties, partyId)?.name ?? "—";
  const vendor = db.vendorInvoices
    .filter((i) => isPayableVendorInvoice(i) && inRegion(region, i.regionId) && hasOutstanding(i.total, i.paidAmount))
    .map((i): PayableRow => ({
      kind: "VENDOR_INVOICE",
      id: i.id,
      party: partyOf(byId(db.vendors, i.vendorId)?.partyId ?? ""),
      projectName: byId(db.projects, i.projectId)?.name ?? "—",
      outstanding: outstandingMoney(i.total, i.paidAmount),
      dueDate: i.dueDate,
      daysOverdue: daysPastDue(i.dueDate, today),
    }));
  const subs = db.subcontractorBills
    .filter((b) => isPayableSubBill(b) && inRegion(region, b.regionId))
    .map((b): PayableRow => {
      const dueDate = subBillDueDate(b.billDate);
      return {
        kind: "SUBCONTRACTOR_BILL",
        id: b.id,
        party: partyOf(byId(db.subcontractors, b.subcontractorId)?.partyId ?? ""),
        projectName: byId(db.projects, b.projectId)?.name ?? "—",
        outstanding: outstandingMoney(b.netPayable, b.paidAmount),
        dueDate,
        daysOverdue: daysPastDue(dueDate, today),
      };
    });
  return [...vendor, ...subs].sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function getPayablesSummary(db: Database, region: RegionFilter = "ALL") {
  const rows = listPayables(db, region);
  const overdue = rows.filter((r) => r.daysOverdue > 0);
  return {
    total: sumMoney(rows.map((r) => r.outstanding)),
    overdue: sumMoney(overdue.map((r) => r.outstanding)),
    overdueCount: overdue.length,
    rows,
  };
}

/** Customer receipts per month (rupees), for the collections chart. */
export function getCollectionsByMonth(db: Database, region: RegionFilter = "ALL") {
  const buckets = new Map<string, number>();
  db.payments
    .filter((p) => isLive(p) && p.direction === "IN" && p.purpose === "INVOICE_RECEIPT" && inRegion(region, p.regionId))
    .forEach((p) => buckets.set(p.paidOn.slice(0, 7), (buckets.get(p.paidOn.slice(0, 7)) ?? 0) + moneyToNumber(p.amount)));
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, collected]) => ({ month, collected }));
}

export interface BudgetRow {
  projectId: string;
  projectName: string;
  planned: number;
  actual: number;
  committed: number;
  /** actual / planned, 0–∞ (1 = fully spent). */
  spentRatio: number;
}

/** Planned budget vs actual and committed cost per project (rupees, for charts). */
export function getBudgetVsActual(db: Database, region: RegionFilter = "ALL"): BudgetRow[] {
  return db.projects
    .filter((p) => isLive(p) && inRegion(region, p.regionId))
    .map((p) => {
      const planned = sum(db.projectBudgetLines.filter((l) => l.projectId === p.id).map((l) => moneyToNumber(l.plannedAmount)));
      const cost = (kind: "ACTUAL" | "COMMITTED") => sum(db.costEntries.filter((c) => isLive(c) && c.projectId === p.id && c.kind === kind).map((c) => moneyToNumber(c.amount)));
      const actual = cost("ACTUAL");
      return { projectId: p.id, projectName: p.name, planned, actual, committed: cost("COMMITTED"), spentRatio: planned ? actual / planned : 0 };
    })
    .sort((a, b) => b.planned - a.planned);
}

export function listPayments(db: Database, region: RegionFilter = "ALL", direction?: Payment["direction"]): Payment[] {
  return db.payments
    .filter((p) => isLive(p) && inRegion(region, p.regionId) && (!direction || p.direction === direction))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn));
}

/** Retention currently held back, by side. */
export function getRetentionSummary(db: Database, region: RegionFilter = "ALL") {
  const projectRegion = new Map(db.projects.map((p) => [p.id, p.regionId]));
  const entries = db.retentionEntries.filter((e) => isLive(e) && inRegion(region, projectRegion.get(e.projectId)));
  const held = (side: "CLIENT" | "SUBCONTRACTOR") =>
    sumMoney(entries.filter((e) => e.side === side).map((e) => (e.type === "WITHHELD" ? e.amount : subMoney("0.00", e.amount))));
  return { receivable: held("CLIENT"), payable: held("SUBCONTRACTOR") };
}
