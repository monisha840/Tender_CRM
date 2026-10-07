import { getToday, lastNMonths, nextMonth15th, toIstDate } from "@/lib/dates";
import { moneyToNumber, subMoney, sumMoney } from "@/lib/money";
import type { Database, HealthStatus, Id, Money } from "@/types";
import { getPayablesSummary, getReceivablesSummary, listInvoices } from "./accounts";
import { balanceOf, isBillAwaitingApproval, isLive, isOnPayroll, isPayableSubBill, subBillDaysOverdue } from "./definitions";
import { listSubcontractorAssignments, type AssignmentRow } from "./parties";
import { listProjects, type ProjectRow } from "./projects";
import { byId, inRegion, sum, type RegionFilter } from "./shared";
import { getTenderStats, getUpcomingDeadlines, listTenders, type TenderRow } from "./tenders";
import { getEpfSummary, getPayrollStatusSummary, listEmployeePay, listPayrollPeriods } from "./workforce";

/**
 * One selector per item of the client's dashboard, in the client's order:
 *  1 Active Tenders · 2 Upcoming Tender Deadlines · 3 Won / Lost Tenders · 4 Active Projects · 5 Project Value
 *  6 Subcontractor Work · 7 Subcontractor Pending Payments · 8 Employee Count · 9 Salary Pending · 10 PF Status
 *  11 GST Due / Filed Status · 12 Customer Receivables · 13 Overall Revenue / Expenses.
 * Money is returned as Money strings; chart series as plain rupee numbers.
 */

// ---- 1 Active Tenders ------------------------------------------------------------------------
export interface ActiveTenders {
  count: number;
  /** Sum of government estimates of open tenders. */
  totalValue: Money;
  byStage: { stageId: Id; stage: string; count: number; value: number }[];
}

export function getActiveTenders(db: Database, region: RegionFilter = "ALL"): ActiveTenders {
  const open = listTenders(db, { region, stageKind: "OPEN" });
  return {
    count: open.length,
    totalValue: sumMoney(open.map((r) => r.tender.estimatedValue)),
    byStage: db.tenderStages
      .filter((s) => s.kind === "OPEN")
      .sort((a, b) => a.sequence - b.sequence)
      .map((s) => {
        const rows = open.filter((r) => r.stage.id === s.id);
        return { stageId: s.id, stage: s.name, count: rows.length, value: moneyToNumber(sumMoney(rows.map((r) => r.tender.estimatedValue))) };
      }),
  };
}

// ---- 2 Upcoming Tender Deadlines -------------------------------------------------------------
export interface UpcomingDeadlines {
  withinDays: number;
  count: number;
  /** Soonest first. */
  rows: TenderRow[];
  /** Deadlines due in the next 2 days. */
  urgent: number;
  /** Of these, tenders that still have mandatory documents not ready. */
  withMissingDocuments: number;
}

export function getUpcomingTenderDeadlines(db: Database, region: RegionFilter = "ALL", withinDays = 7): UpcomingDeadlines {
  const rows = getUpcomingDeadlines(db, region, withinDays);
  return {
    withinDays,
    count: rows.length,
    rows,
    urgent: rows.filter((r) => r.daysToDeadline <= 2).length,
    withMissingDocuments: rows.filter((r) => db.tenderDocumentItems.some((d) => d.tenderId === r.tender.id && d.isMandatory && d.status !== "READY" && d.status !== "NA")).length,
  };
}

// ---- 3 Won / Lost Tenders --------------------------------------------------------------------
export interface WonLostTenders {
  won: number;
  lost: number;
  /** 0–100, or null before any tender is decided. */
  winRate: number | null;
  wonValue: Money;
  lostValue: Money;
  /** Won and lost value (rupees) by month of the submission deadline, for a stacked bar. */
  byMonth: { month: string; won: number; lost: number }[];
}

export function getWonLostTenders(db: Database, region: RegionFilter = "ALL"): WonLostTenders {
  const stats = getTenderStats(db, region);
  const rows = listTenders(db, { region });
  const value = (kind: "WON" | "LOST") => sumMoney(rows.filter((r) => r.stage.kind === kind).map((r) => r.bid?.quotedAmount ?? r.tender.estimatedValue));
  const buckets = new Map<string, { month: string; won: number; lost: number }>();
  rows.forEach((r) => {
    if (r.stage.kind !== "WON" && r.stage.kind !== "LOST") return;
    const month = toIstDate(r.tender.submissionDeadlineAt).slice(0, 7);
    const b = buckets.get(month) ?? { month, won: 0, lost: 0 };
    const v = moneyToNumber(r.bid?.quotedAmount ?? r.tender.estimatedValue);
    if (r.stage.kind === "WON") b.won += v;
    else b.lost += v;
    buckets.set(month, b);
  });
  return {
    won: stats.wonCount,
    lost: stats.lostCount,
    winRate: stats.winRate,
    wonValue: value("WON"),
    lostValue: value("LOST"),
    byMonth: [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month)),
  };
}

// ---- 4 Active Projects -----------------------------------------------------------------------
export interface ActiveProjects {
  count: number;
  rows: ProjectRow[];
  byHealth: Record<HealthStatus, number>;
  /** Average executed progress across active projects, weighted by contract value (0–100). */
  avgProgressPct: number;
  /** Planned vs actual progress per month, averaged across active projects, for a line chart. */
  progressHistory: { month: string; planned: number; actual: number }[];
}

export function getActiveProjects(db: Database, region: RegionFilter = "ALL"): ActiveProjects {
  const rows = listProjects(db, region).filter((r) => r.status.systemKey !== "COMPLETED");
  const weight = sum(rows.map((r) => moneyToNumber(r.project.contractValue)));
  const ids = new Set(rows.map((r) => r.project.id));
  const months = new Map<string, { planned: number[]; actual: number[] }>();
  db.progressSnapshots
    .filter((s) => ids.has(s.projectId))
    .forEach((s) => {
      const m = months.get(s.month) ?? { planned: [], actual: [] };
      m.planned.push(Number(s.plannedPct));
      m.actual.push(Number(s.actualPct));
      months.set(s.month, m);
    });
  const avg = (v: number[]) => (v.length ? sum(v) / v.length : 0);
  return {
    count: rows.length,
    rows,
    byHealth: {
      GREEN: rows.filter((r) => r.health === "GREEN").length,
      AMBER: rows.filter((r) => r.health === "AMBER").length,
      RED: rows.filter((r) => r.health === "RED").length,
    },
    avgProgressPct: weight ? sum(rows.map((r) => r.progressPct * moneyToNumber(r.project.contractValue))) / weight : 0,
    progressHistory: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, planned: avg(v.planned), actual: avg(v.actual) })),
  };
}

// ---- 5 Project Value -------------------------------------------------------------------------
export interface ProjectValue {
  /** Contract value of active projects. */
  activeContractValue: Money;
  /** Contract value including completed projects. */
  totalContractValue: Money;
  /** Billed to date: taxable value of live invoices, EXCLUDING GST (the one "billed" definition), all projects. */
  billedToDate: Money;
  received: Money;
  /** Active contract value not yet invoiced. */
  yetToBill: Money;
  byServiceLine: { serviceLine: string; value: number }[];
  byContractType: { type: "SERVICE" | "FIXED_SCOPE"; value: number; count: number }[];
}

export function getProjectValue(db: Database, region: RegionFilter = "ALL"): ProjectValue {
  const rows = listProjects(db, region);
  const active = rows.filter((r) => r.status.systemKey !== "COMPLETED");
  const liveInvoices = db.invoices.filter(isLive);
  const taxable = (ids: Id[]) => sumMoney(liveInvoices.filter((i) => ids.includes(i.projectId)).map((i) => i.taxableValue));
  const lines = new Map<string, number>();
  rows.forEach((r) => lines.set(r.serviceLineName, (lines.get(r.serviceLineName) ?? 0) + moneyToNumber(r.project.contractValue)));
  const ofType = (t: "SERVICE" | "FIXED_SCOPE") => rows.filter((r) => r.project.contractType === t);
  const allIds = rows.map((r) => r.project.id);
  return {
    activeContractValue: sumMoney(active.map((r) => r.project.contractValue)),
    totalContractValue: sumMoney(rows.map((r) => r.project.contractValue)),
    billedToDate: taxable(allIds),
    received: sumMoney(liveInvoices.filter((i) => allIds.includes(i.projectId)).map((i) => i.receivedAmount)),
    yetToBill: subMoney(sumMoney(active.map((r) => r.project.contractValue)), taxable(active.map((r) => r.project.id))),
    byServiceLine: [...lines.entries()].map(([serviceLine, value]) => ({ serviceLine, value })).sort((a, b) => b.value - a.value),
    byContractType: (["SERVICE", "FIXED_SCOPE"] as const).map((type) => ({
      type,
      value: moneyToNumber(sumMoney(ofType(type).map((r) => r.project.contractValue))),
      count: ofType(type).length,
    })),
  };
}

// ---- 6 Subcontractor Work --------------------------------------------------------------------
export interface SubcontractorWork {
  subcontractors: number;
  assignments: number;
  contractValue: Money;
  billed: Money;
  /** Contract-value-weighted progress of running assignments (0–100). */
  avgProgressPct: number;
  byTrade: { trade: string; assignments: number; contractValue: number; avgProgressPct: number }[];
  rows: AssignmentRow[];
}

export function getSubcontractorWork(db: Database, region: RegionFilter = "ALL"): SubcontractorWork {
  const rows = listSubcontractorAssignments(db, { region });
  const running = rows.filter((r) => r.workOrder.status === "ACTIVE");
  const weight = sum(running.map((r) => moneyToNumber(r.contractValue)));
  const trades = new Map<string, AssignmentRow[]>();
  running.forEach((r) => trades.set(r.trade, [...(trades.get(r.trade) ?? []), r]));
  return {
    subcontractors: new Set(rows.map((r) => r.workOrder.subcontractorId)).size,
    assignments: rows.length,
    contractValue: sumMoney(rows.map((r) => r.contractValue)),
    billed: sumMoney(rows.map((r) => r.billed)),
    avgProgressPct: weight ? sum(running.map((r) => r.progressPct * moneyToNumber(r.contractValue))) / weight : 0,
    byTrade: [...trades.entries()].map(([trade, list]) => ({
      trade,
      assignments: list.length,
      contractValue: sum(list.map((r) => moneyToNumber(r.contractValue))),
      avgProgressPct: sum(list.map((r) => r.progressPct)) / list.length,
    })),
    rows,
  };
}

// ---- 7 Subcontractor Pending Payments --------------------------------------------------------
export interface SubcontractorPendingPayments {
  /** Net payable on approved and part-paid bills still unpaid (rejected bills never count; same rule as Finance payables). */
  balance: Money;
  /** Of which past the 30-day payment term. */
  overdue: Money;
  billsAwaitingApproval: number;
  amountAwaitingApproval: Money;
  /** Largest balances first. */
  bySubcontractor: { subcontractorId: Id; name: string; balance: Money }[];
}

export function getSubcontractorPendingPayments(db: Database, region: RegionFilter = "ALL"): SubcontractorPendingPayments {
  const today = getToday();
  const bills = db.subcontractorBills.filter((b) => isLive(b) && inRegion(region, b.regionId));
  const payable = bills.filter(isPayableSubBill);
  const waiting = bills.filter(isBillAwaitingApproval);
  const outstanding = (b: (typeof bills)[number]) => balanceOf(b.netPayable, b.paidAmount);
  const per = new Map<Id, Money>();
  payable.forEach((b) => per.set(b.subcontractorId, sumMoney([per.get(b.subcontractorId) ?? "0.00", outstanding(b)])));
  return {
    balance: sumMoney(payable.map(outstanding)),
    overdue: sumMoney(payable.filter((b) => subBillDaysOverdue(b.billDate, today) > 0).map(outstanding)),
    billsAwaitingApproval: waiting.length,
    amountAwaitingApproval: sumMoney(waiting.map((b) => b.netPayable)),
    bySubcontractor: [...per.entries()]
      .map(([subcontractorId, balance]) => ({ subcontractorId, name: byId(db.parties, byId(db.subcontractors, subcontractorId)?.partyId)?.name ?? "—", balance }))
      .sort((a, b) => moneyToNumber(b.balance) - moneyToNumber(a.balance)),
  };
}

// ---- 8 Employee Count ------------------------------------------------------------------------
export interface EmployeeCount {
  /** Headcount: every live employee, directors included (see definitions.ts). */
  total: number;
  /** Of the headcount, those with a wage above zero (directors without a salary are not). */
  onPayroll: number;
  byDepartment: { department: string; count: number }[];
  byRegion: { regionId: Id; region: string; count: number }[];
  /** Employees currently assigned to a plant site. */
  assignedToSites: number;
}

export function getEmployeeCount(db: Database, region: RegionFilter = "ALL"): EmployeeCount {
  const today = getToday();
  const emps = db.employees.filter((e) => isLive(e) && inRegion(region, e.homeRegionId));
  const profileOf = (id: Id) => db.employeeProfiles.find((p) => p.employeeId === id);
  const dept = new Map<string, number>();
  emps.forEach((e) => {
    const d = profileOf(e.id)?.department ?? "Other";
    dept.set(d, (dept.get(d) ?? 0) + 1);
  });
  return {
    total: emps.length,
    onPayroll: emps.filter((e) => isOnPayroll(profileOf(e.id))).length,
    byDepartment: [...dept.entries()].map(([department, count]) => ({ department, count })).sort((a, b) => b.count - a.count),
    byRegion: db.regions.filter((r) => inRegion(region, r.id)).map((r) => ({ regionId: r.id, region: r.name, count: emps.filter((e) => e.homeRegionId === r.id).length })),
    assignedToSites: new Set(db.siteAssignments.filter((a) => !a.toDate || a.toDate >= today).map((a) => a.employeeId)).size,
  };
}

// ---- 9 Salary Pending ------------------------------------------------------------------------
export interface SalaryPending {
  /** Latest payroll month, "YYYY-MM". */
  period: string | null;
  pendingAmount: Money;
  onHoldAmount: Money;
  paidAmount: Money;
  employeesPending: number;
  employeesOnHold: number;
  /** Advance given to employees and not yet recovered. */
  advanceOutstanding: Money;
  /** Run status per region for the period. */
  runs: { region: string; status: string }[];
}

export function getSalaryPending(db: Database, region: RegionFilter = "ALL"): SalaryPending {
  const period = listPayrollPeriods(db)[0] ?? null;
  if (!period) {
    return { period, pendingAmount: "0.00", onHoldAmount: "0.00", paidAmount: "0.00", employeesPending: 0, employeesOnHold: 0, advanceOutstanding: "0.00", runs: [] };
  }
  const summary = getPayrollStatusSummary(db, period, region);
  const slips = listEmployeePay(db, period, region).filter((r) => r.payslip);
  return {
    period,
    pendingAmount: summary.pending,
    onHoldAmount: summary.onHold,
    paidAmount: summary.paid,
    employeesPending: slips.filter((r) => r.payslip!.paymentStatus === "PENDING").length,
    employeesOnHold: slips.filter((r) => r.payslip!.paymentStatus === "ON_HOLD").length,
    advanceOutstanding: summary.advanceOutstanding,
    runs: db.payrollRuns.filter((r) => r.periodMonth === period && inRegion(region, r.regionId)).map((r) => ({ region: byId(db.regions, r.regionId)?.name ?? "—", status: r.status })),
  };
}

// ---- 10 PF Status ----------------------------------------------------------------------------
export type PfRemittance = "REMITTED" | "PENDING" | "OVERDUE";

export interface PfStatus {
  period: string | null;
  members: number;
  employeeShare: Money;
  employerShare: Money;
  total: Money;
  /** 15th of the month after `period`. */
  dueDate: string | null;
  status: PfRemittance | null;
  /** Last six payroll months, oldest first. */
  history: { period: string; total: number; status: PfRemittance }[];
}

/** A month's PF counts as remitted once its payroll run is locked; otherwise pending until the 15th, then overdue. */
function pfRemittance(db: Database, period: string, region: RegionFilter): PfRemittance {
  const runs = db.payrollRuns.filter((r) => r.periodMonth === period && inRegion(region, r.regionId));
  if (runs.length && runs.every((r) => r.status === "LOCKED" || r.status === "PAID")) return "REMITTED";
  return getToday() > nextMonth15th(period) ? "OVERDUE" : "PENDING";
}

export function getPfStatus(db: Database, region: RegionFilter = "ALL"): PfStatus {
  const periods = listPayrollPeriods(db);
  const period = periods[0] ?? null;
  const epf = period ? getEpfSummary(db, period, region) : null;
  return {
    period,
    members: epf?.members ?? 0,
    employeeShare: epf?.employeeShare ?? "0.00",
    employerShare: epf?.employerShare ?? "0.00",
    total: epf?.total ?? "0.00",
    dueDate: period ? nextMonth15th(period) : null,
    status: period ? pfRemittance(db, period, region) : null,
    history: periods
      .slice(0, 6)
      .reverse()
      .map((p) => ({ period: p, total: getEpfSummary(db, p, region).totalNumber, status: pfRemittance(db, p, region) })),
  };
}

// ---- 11 GST Due / Filed Status ---------------------------------------------------------------
export interface GstStatus {
  filed: number;
  pending: number;
  overdue: number;
  /** GST on invoices whose filing is still pending. */
  pendingTax: Money;
  nextDueDate: string | null;
  /** Invoices by invoice month with filed / pending counts and tax, oldest first (12 months). */
  byMonth: { month: string; filed: number; pending: number; tax: number }[];
}

export function getGstDueFiledStatus(db: Database, region: RegionFilter = "ALL"): GstStatus {
  const rows = listInvoices(db, { region });
  const pending = rows.filter((r) => r.invoice.gstFilingStatus === "PENDING");
  const taxOf = (i: { cgst: Money; sgst: Money; igst: Money }) => sumMoney([i.cgst, i.sgst, i.igst]);
  return {
    filed: rows.length - pending.length,
    pending: pending.length,
    overdue: pending.filter((r) => r.filingDaysOverdue > 0).length,
    pendingTax: sumMoney(pending.map((r) => taxOf(r.invoice))),
    nextDueDate: pending.map((r) => r.invoice.gstFilingDueDate).filter((d) => d >= getToday()).sort()[0] ?? null,
    byMonth: lastNMonths(12).map((month) => {
      const inMonth = rows.filter((r) => r.invoice.invoiceDate.startsWith(month));
      return {
        month,
        filed: inMonth.filter((r) => r.invoice.gstFilingStatus === "FILED").length,
        pending: inMonth.filter((r) => r.invoice.gstFilingStatus === "PENDING").length,
        tax: moneyToNumber(sumMoney(inMonth.map((r) => taxOf(r.invoice)))),
      };
    }),
  };
}

// ---- 12 Customer Receivables -----------------------------------------------------------------
export interface CustomerReceivables {
  total: Money;
  overdue: Money;
  overdueCount: number;
  /** Outstanding by days past due: 0–30, 31–60, 61–90, 90+ (same definition as the Finance receivables tab). */
  aging: { bucket: string; amount: number; count: number }[];
  byOrganisation: { organisationId: Id; name: string; outstanding: Money }[];
}

export function getCustomerReceivables(db: Database, region: RegionFilter = "ALL"): CustomerReceivables {
  const summary = getReceivablesSummary(db, region);
  const rows = summary.rows;
  const per = new Map<Id, Money>();
  rows.forEach((r) => per.set(r.invoice.organisationId, sumMoney([per.get(r.invoice.organisationId) ?? "0.00", r.outstanding])));
  return {
    total: summary.total,
    overdue: summary.overdue,
    overdueCount: summary.overdueCount,
    aging: summary.ageing,
    byOrganisation: [...per.entries()]
      .map(([organisationId, outstanding]) => ({ organisationId, name: byId(db.organisations, organisationId)?.shortName ?? "—", outstanding }))
      .sort((a, b) => moneyToNumber(b.outstanding) - moneyToNumber(a.outstanding)),
  };
}

// ---- 13 Overall Revenue / Expenses -----------------------------------------------------------
export interface RevenueExpenses {
  months: { month: string; revenue: number; expenses: number; profit: number }[];
  totalRevenue: number;
  totalExpenses: number;
  /** (revenue − expenses) / revenue, 0–100. */
  marginPct: number;
}

/** Revenue = invoiced taxable value by invoice month; expenses = actual project cost entries by month. */
export function getRevenueExpenses(db: Database, region: RegionFilter = "ALL", months = 12): RevenueExpenses {
  const series = lastNMonths(months).map((month) => {
    const revenue = sum(db.invoices.filter((i) => isLive(i) && i.invoiceDate.startsWith(month) && inRegion(region, i.regionId)).map((i) => moneyToNumber(i.taxableValue)));
    const expenses = sum(db.costEntries.filter((c) => isLive(c) && c.kind === "ACTUAL" && c.date.startsWith(month) && inRegion(region, c.regionId)).map((c) => moneyToNumber(c.amount)));
    return { month, revenue, expenses, profit: revenue - expenses };
  });
  const totalRevenue = sum(series.map((s) => s.revenue));
  const totalExpenses = sum(series.map((s) => s.expenses));
  return { months: series, totalRevenue, totalExpenses, marginPct: totalRevenue ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 : 0 };
}

// ---- Everything at once ----------------------------------------------------------------------
export interface Dashboard {
  activeTenders: ActiveTenders;
  upcomingDeadlines: UpcomingDeadlines;
  wonLost: WonLostTenders;
  activeProjects: ActiveProjects;
  projectValue: ProjectValue;
  subcontractorWork: SubcontractorWork;
  subcontractorPending: SubcontractorPendingPayments;
  employees: EmployeeCount;
  salaryPending: SalaryPending;
  pf: PfStatus;
  gst: GstStatus;
  receivables: CustomerReceivables;
  revenueExpenses: RevenueExpenses;
  /** Extra (not one of the client's 13). */
  payables: Money;
}

/** The client's 13 dashboard items for a region filter. Pending approvals and missing reports are extra selectors. */
export function getDashboard(db: Database, region: RegionFilter = "ALL"): Dashboard {
  return {
    activeTenders: getActiveTenders(db, region),
    upcomingDeadlines: getUpcomingTenderDeadlines(db, region),
    wonLost: getWonLostTenders(db, region),
    activeProjects: getActiveProjects(db, region),
    projectValue: getProjectValue(db, region),
    subcontractorWork: getSubcontractorWork(db, region),
    subcontractorPending: getSubcontractorPendingPayments(db, region),
    employees: getEmployeeCount(db, region),
    salaryPending: getSalaryPending(db, region),
    pf: getPfStatus(db, region),
    gst: getGstDueFiledStatus(db, region),
    receivables: getCustomerReceivables(db, region),
    revenueExpenses: getRevenueExpenses(db, region),
    payables: getPayablesSummary(db, region).total,
  };
}
