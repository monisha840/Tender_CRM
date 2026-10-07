import { addDays, daysBetween, getToday } from "@/lib/dates";
import { moneyToNumber, subMoney, sumMoney } from "@/lib/money";
import type { Database, Money, Payment, RaBill } from "@/types";
import { byId, clientName, inRegion, sum, type RegionFilter } from "./shared";

export interface ReceivableRow {
  bill: RaBill;
  projectName: string;
  clientName: string;
  outstanding: Money;
  /** Days past due; 0 when not yet due. */
  daysOverdue: number;
}

export function listReceivables(db: Database, region: RegionFilter = "ALL"): ReceivableRow[] {
  const today = getToday();
  return db.raBills
    .filter((b) => !b.deletedAt && inRegion(region, b.regionId))
    .map((bill) => ({
      bill,
      projectName: byId(db.projects, bill.projectId)?.name ?? "—",
      clientName: clientName(db, bill.clientId),
      outstanding: subMoney(bill.netPayable, bill.receivedAmount),
      daysOverdue: Math.max(0, daysBetween(bill.dueDate, today)),
    }))
    .filter((r) => Number(r.outstanding) > 0)
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}

export function getReceivablesSummary(db: Database, region: RegionFilter = "ALL") {
  const rows = listReceivables(db, region);
  const overdue = rows.filter((r) => r.daysOverdue > 0);
  return {
    total: sumMoney(rows.map((r) => r.outstanding)),
    overdue: sumMoney(overdue.map((r) => r.outstanding)),
    overdueCount: overdue.length,
    rows,
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

/** Vendor invoices and approved subcontractor bills not yet fully paid. */
export function listPayables(db: Database, region: RegionFilter = "ALL"): PayableRow[] {
  const today = getToday();
  const partyOf = (partyId: string) => byId(db.parties, partyId)?.name ?? "—";
  const vendor = db.vendorInvoices
    .filter((i) => inRegion(region, i.regionId) && Number(subMoney(i.total, i.paidAmount)) > 0)
    .map((i): PayableRow => ({
      kind: "VENDOR_INVOICE",
      id: i.id,
      party: partyOf(byId(db.vendors, i.vendorId)?.partyId ?? ""),
      projectName: byId(db.projects, i.projectId)?.name ?? "—",
      outstanding: subMoney(i.total, i.paidAmount),
      dueDate: i.dueDate,
      daysOverdue: Math.max(0, daysBetween(i.dueDate, today)),
    }));
  const subs = db.subcontractorBills
    .filter((b) => inRegion(region, b.regionId) && ["APPROVED", "PARTLY_PAID"].includes(b.status))
    .map((b): PayableRow => {
      const dueDate = addDays(b.billDate, 30);
      return {
        kind: "SUBCONTRACTOR_BILL",
        id: b.id,
        party: partyOf(byId(db.subcontractors, b.subcontractorId)?.partyId ?? ""),
        projectName: byId(db.projects, b.projectId)?.name ?? "—",
        outstanding: subMoney(b.netPayable, b.paidAmount),
        dueDate,
        daysOverdue: Math.max(0, daysBetween(dueDate, today)),
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

/** Department receipts per month (rupees), for the collections chart. */
export function getCollectionsByMonth(db: Database, region: RegionFilter = "ALL") {
  const buckets = new Map<string, number>();
  db.payments
    .filter((p) => p.direction === "IN" && p.purpose === "RA_RECEIPT" && inRegion(region, p.regionId))
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
    .filter((p) => inRegion(region, p.regionId))
    .map((p) => {
      const planned = sum(db.projectBudgetLines.filter((l) => l.projectId === p.id).map((l) => moneyToNumber(l.plannedAmount)));
      const cost = (kind: "ACTUAL" | "COMMITTED") => sum(db.costEntries.filter((c) => c.projectId === p.id && c.kind === kind).map((c) => moneyToNumber(c.amount)));
      const actual = cost("ACTUAL");
      return { projectId: p.id, projectName: p.name, planned, actual, committed: cost("COMMITTED"), spentRatio: planned ? actual / planned : 0 };
    })
    .sort((a, b) => b.planned - a.planned);
}

export function listPayments(db: Database, region: RegionFilter = "ALL", direction?: Payment["direction"]): Payment[] {
  return db.payments
    .filter((p) => inRegion(region, p.regionId) && (!direction || p.direction === direction))
    .sort((a, b) => b.paidOn.localeCompare(a.paidOn));
}

/** Retention currently held back, by side. */
export function getRetentionSummary(db: Database, region: RegionFilter = "ALL") {
  const projectRegion = new Map(db.projects.map((p) => [p.id, p.regionId]));
  const entries = db.retentionEntries.filter((e) => inRegion(region, projectRegion.get(e.projectId)));
  const held = (side: "CLIENT" | "SUBCONTRACTOR") =>
    sumMoney(entries.filter((e) => e.side === side).map((e) => (e.type === "WITHHELD" ? e.amount : subMoney("0.00", e.amount))));
  return { receivable: held("CLIENT"), payable: held("SUBCONTRACTOR") };
}
