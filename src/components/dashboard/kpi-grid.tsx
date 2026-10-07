"use client";

import { Briefcase, CalendarClock, CircleDollarSign, FileCheck2, Gavel, HandCoins, Hammer, Landmark, TrendingUp, Trophy, UserCheck, Users, Wallet, type LucideIcon } from "lucide-react";
import { KpiTile } from "@/components/shared/kpi-tile";
import { canView, type Dashboard } from "@/lib/data";
import { formatDate, formatMonth } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { isModuleEnabled, PHASE67_ENABLED } from "@/lib/features";
import { useCurrentPersona } from "@/store/hooks";
import { useAsOfDb } from "@/components/layout/use-as-of-db";

interface TileSpec {
  n: number;
  /** data-testid is `kpi-<slug>` */
  slug: string;
  module: string;
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  href: string;
  trend?: number[];
}

const cr = (v: Parameters<typeof formatINR>[0]) => formatINR(v, { compact: "auto" });
const pct = (v: number) => `${Math.round(v)}%`;

/** The client's 13 dashboard items, in the client's order, as one tile each (numbered 1-13). */
export function buildTiles(d: Dashboard, manpower: number[]): TileSpec[] {
  const pfStatus = d.pf.status === "REMITTED" ? "remitted" : d.pf.status === "OVERDUE" ? "overdue" : "pending";
  return [
    { n: 1, slug: "active-tenders", module: "tenders", label: "Active tenders", value: String(d.activeTenders.count), hint: `${cr(d.activeTenders.totalValue)} estimated value`, icon: Gavel, href: "/tenders?status=open", trend: d.activeTenders.byStage.map((s) => s.count) },
    { n: 2, slug: "upcoming-deadlines", module: "tenders", label: "Upcoming deadlines", value: String(d.upcomingDeadlines.count), hint: `next ${d.upcomingDeadlines.withinDays} days · ${d.upcomingDeadlines.urgent} within 2 days`, icon: CalendarClock, href: "/tenders/deadlines" },
    { n: 3, slug: "won-lost", module: "tenders", label: "Won / lost", value: `${d.wonLost.won} / ${d.wonLost.lost}`, hint: `win rate ${d.wonLost.winRate === null ? "—" : pct(d.wonLost.winRate)} · won ${cr(d.wonLost.wonValue)}`, icon: Trophy, href: "/tenders?result=decided", trend: d.wonLost.byMonth.map((m) => m.won) },
    { n: 4, slug: "active-projects", module: "projects", label: "Active projects", value: String(d.activeProjects.count), hint: `${d.activeProjects.byHealth.GREEN} on track · ${d.activeProjects.byHealth.AMBER} at risk · ${d.activeProjects.byHealth.RED} delayed`, icon: Briefcase, href: "/projects?status=RUNNING", trend: d.activeProjects.progressHistory.map((p) => p.actual) },
    { n: 5, slug: "project-value", module: "projects", label: "Project value", value: cr(d.projectValue.activeContractValue), hint: PHASE67_ENABLED ? `billed (excl. GST) ${cr(d.projectValue.billedToDate)} · to bill ${cr(d.projectValue.yetToBill)}` : "contract value of active projects", icon: CircleDollarSign, href: "/projects?sort=value", trend: d.projectValue.byServiceLine.map((s) => s.value) },
    { n: 6, slug: "subcontractor-work", module: "subcontractors", label: "Subcontractor work", value: `${d.subcontractorWork.assignments} assignments`, hint: `${d.subcontractorWork.subcontractors} subcontractors · ${pct(d.subcontractorWork.avgProgressPct)} avg progress`, icon: Hammer, href: "/subcontractors", trend: d.subcontractorWork.byTrade.map((t) => t.avgProgressPct) },
    { n: 7, slug: "subcontractor-pending", module: "subcontractors", label: "Subcontractor pending payments", value: cr(d.subcontractorPending.balance), hint: `${cr(d.subcontractorPending.overdue)} overdue · ${d.subcontractorPending.billsAwaitingApproval} bills to approve`, icon: HandCoins, href: "/subcontractors?payment=pending" },
    { n: 8, slug: "headcount", module: "employees", label: "Headcount (incl. directors)", value: String(d.employees.total), hint: `${d.employees.onPayroll} on payroll (wage above zero) · ${d.employees.assignedToSites} at plant sites`, icon: Users, href: "/employees", trend: manpower },
    { n: 9, slug: "salary-pending", module: "employees", label: "Salary pending", value: cr(d.salaryPending.pendingAmount), hint: `${d.salaryPending.employeesPending} employees${d.salaryPending.period ? ` · ${formatMonth(d.salaryPending.period)}` : ""}`, icon: Wallet, href: "/employees?salary=pending" },
    { n: 10, slug: "pf-status", module: "employees", label: "PF status", value: cr(d.pf.total), hint: `${d.pf.period ? formatMonth(d.pf.period) : "—"} ${pfStatus} · due ${d.pf.dueDate ? formatDate(d.pf.dueDate) : "—"} · ${d.pf.members} members`, icon: UserCheck, href: "/employees/payroll/dashboard", trend: d.pf.history.map((h) => h.total) },
    { n: 11, slug: "gst", module: "finance", label: "GST filed / due", value: `${d.gst.filed} / ${d.gst.pending}`, hint: `${d.gst.overdue} overdue · ${cr(d.gst.pendingTax)} tax to file${d.gst.nextDueDate ? ` · next ${formatDate(d.gst.nextDueDate)}` : ""}`, icon: FileCheck2, href: "/finance?view=gst", trend: d.gst.byMonth.map((m) => m.tax) },
    { n: 12, slug: "receivables", module: "finance", label: "Customer receivables", value: cr(d.receivables.total), hint: `${cr(d.receivables.overdue)} overdue · ${d.receivables.overdueCount} invoices`, icon: Landmark, href: "/finance?view=receivables", trend: d.receivables.aging.map((a) => a.amount) },
    { n: 13, slug: "revenue-expenses", module: "finance", label: "Revenue / expenses", value: cr(d.revenueExpenses.totalRevenue), hint: `expenses ${cr(d.revenueExpenses.totalExpenses)} · margin ${d.revenueExpenses.marginPct.toFixed(1)}% · 12 months`, icon: TrendingUp, href: "/finance", trend: d.revenueExpenses.months.map((m) => m.revenue) },
  ];
}

export function KpiGrid({ dashboard, manpower, only }: { dashboard: Dashboard; manpower: number[]; only?: number[] }) {
  const db = useAsOfDb();
  const persona = useCurrentPersona();
  const tiles = buildTiles(dashboard, manpower).filter((t) => (!only || only.includes(t.n)) && isModuleEnabled(t.module) && canView(db, persona.user.id, t.module));
  return (
    <section aria-label="Key figures" className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {tiles.map((t) => (
        <KpiTile key={t.n} testId={`kpi-${t.slug}`} label={`${t.n}. ${t.label}`} value={t.value} hint={t.hint} icon={t.icon} href={t.href} trend={t.trend} />
      ))}
    </section>
  );
}
