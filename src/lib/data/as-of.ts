import { toIstDate } from "@/lib/dates";
import { cmpMoney, subMoney, sumMoney } from "@/lib/money";
import type { Database, Id, InvoicePaymentStatus, IsoDate } from "@/types";

/**
 * The database as it stood at the end of `asOf` (the header's "as of" date): rows dated later are dropped and the
 * figures that depend on them are recomputed, so a past date shows the pipeline, receivables and site activity of
 * that day rather than today's with different "days overdue".
 *
 * Handled: tenders (registered on or before the date, in the stage they had then), invoices (and what had been
 * received by then), payments, subcontractor bills, daily reports, site issues, attendance, cost entries, approval
 * requests, GO/NO-GO decisions, payroll runs and their payslips. Master data is untouched.
 */
export function dbAsOf(db: Database, asOf: IsoDate): Database {
  const dateOf = (iso: string): IsoDate => (iso.length > 10 ? toIstDate(iso) : iso);
  const upTo = (iso: string | null | undefined) => !iso || dateOf(iso) <= asOf;

  const history = db.tenderStageHistory.filter((h) => upTo(h.changedAt));
  const stageOnDate = new Map<Id, Id>();
  [...history]
    .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
    .forEach((h) => stageOnDate.set(h.tenderId, h.toStageId));
  const registered = new Set(history.map((h) => h.tenderId));
  const tenders = db.tenders
    // A tender with no recorded history (created in the browser) is dated by its publish date, else kept.
    .filter((t) => registered.has(t.id) || !db.tenderStageHistory.some((h) => h.tenderId === t.id))
    .filter((t) => upTo(t.publishedOn))
    .map((t) => (stageOnDate.has(t.id) && stageOnDate.get(t.id) !== t.currentStageId ? { ...t, currentStageId: stageOnDate.get(t.id)! } : t));

  const payments = db.payments.filter((p) => p.paidOn <= asOf);
  const received = new Map<Id, string[]>();
  payments.forEach((p) => {
    if (p.invoiceId && p.direction === "IN") received.set(p.invoiceId, [...(received.get(p.invoiceId) ?? []), p.amount]);
  });
  const hadPayments = new Set(db.payments.filter((p) => p.invoiceId).map((p) => p.invoiceId));
  const invoices = db.invoices
    .filter((i) => i.invoiceDate <= asOf)
    .map((i) => {
      if (!hadPayments.has(i.id)) return i;
      const receivedAmount = sumMoney(received.get(i.id) ?? []);
      if (receivedAmount === i.receivedAmount) return i;
      const paymentStatus: InvoicePaymentStatus =
        cmpMoney(receivedAmount, "0.00") === 0 ? "UNPAID" : cmpMoney(subMoney(i.netReceivable, receivedAmount), "0.00") <= 0 ? "PAID" : "PARTLY_PAID";
      return { ...i, receivedAmount, paymentStatus };
    });

  const runs = db.payrollRuns.filter((r) => r.periodMonth <= asOf.slice(0, 7));
  const runIds = new Set(runs.map((r) => r.id));

  return {
    ...db,
    tenders,
    tenderStageHistory: history,
    goNoGoDecisions: db.goNoGoDecisions.filter((d) => upTo(d.decidedAt)),
    invoices,
    payments,
    subcontractorBills: db.subcontractorBills.filter((b) => b.billDate <= asOf),
    dailyReports: db.dailyReports.filter((r) => r.reportDate <= asOf),
    siteIssues: db.siteIssues.filter((i) => i.raisedOn <= asOf),
    attendance: db.attendance.filter((a) => a.date <= asOf),
    costEntries: db.costEntries.filter((c) => c.date <= asOf),
    approvalRequests: db.approvalRequests.filter((r) => upTo(r.submittedAt)),
    payrollRuns: runs,
    payslips: db.payslips.filter((p) => runIds.has(p.payrollRunId)),
  };
}

const cache = new WeakMap<Database, { asOf: IsoDate; view: Database }>();

/** `dbAsOf`, remembered per database snapshot so many components asking for the same day share one result. */
export function dbForDate(db: Database, asOf: IsoDate | null): Database {
  if (!asOf) return db;
  const hit = cache.get(db);
  if (hit && hit.asOf === asOf) return hit.view;
  const view = dbAsOf(db, asOf);
  cache.set(db, { asOf, view });
  return view;
}
