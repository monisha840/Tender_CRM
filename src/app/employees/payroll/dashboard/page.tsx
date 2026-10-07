"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { PageHeader } from "@/components/layout/page-header";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { WorkforceTabs } from "@/components/workforce/workforce-tabs";
import { getPfStatus, getSalaryPending, listEmployees } from "@/lib/data";
import { formatDate, formatMonth } from "@/lib/dates";
import { formatINR, formatINRAxis } from "@/lib/money";
import { getPayrollTrend } from "@/modules/workforce/queries";
import { useDb, useRegionFilter } from "@/store/hooks";

const salaryConfig = {
  paid: { label: "Paid", color: "var(--chart-1)" },
  pending: { label: "Pending", color: "var(--chart-4)" },
  onHold: { label: "On hold", color: "var(--chart-5)" },
} satisfies ChartConfig;
const pfConfig = { pf: { label: "PF (employee + employer)", color: "var(--chart-1)" } } satisfies ChartConfig;

const PF_TONE: Record<string, { tone: StatusTone; label: string }> = {
  REMITTED: { tone: "success", label: "Remitted" },
  PENDING: { tone: "warning", label: "Pending" },
  OVERDUE: { tone: "danger", label: "Overdue" },
};

export default function PayrollDashboardPage() {
  const db = useDb();
  const { region } = useRegionFilter();
  const salary = useMemo(() => getSalaryPending(db, region), [db, region]);
  const pf = useMemo(() => getPfStatus(db, region), [db, region]);
  const trend = useMemo(() => getPayrollTrend(db, region, 6).map((t) => ({ ...t, label: formatMonth(t.period).split(" ")[0] })), [db, region]);
  const headcount = useMemo(() => listEmployees(db, region).length, [db, region]);
  const pfTone = pf.status ? PF_TONE[pf.status] : null;
  const month = salary.period ? formatMonth(salary.period) : "—";
  const pendingTotal = Number(salary.pendingAmount) + Number(salary.onHoldAmount);

  return (
    <>
      <PageHeader title="Payroll dashboard" description={`Salary and PF position for ${month}.`} />
      <WorkforceTabs />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Employees" value={String(headcount)} hint={`${trend.at(-1)?.employees ?? 0} on ${month} payroll`} href="/employees" />
        <KpiTile label="Salary paid" value={formatINR(salary.paidAmount, { compact: true })} hint={month} />
        <KpiTile
          label="Salary pending"
          value={formatINR(pendingTotal, { compact: true })}
          hint={`${salary.employeesPending} pending · ${salary.employeesOnHold} on hold`}
          href="/employees/payroll"
        />
        <KpiTile
          label="PF status"
          value={formatINR(pf.total, { compact: true })}
          hint={pf.dueDate ? `Due ${formatDate(pf.dueDate)}` : undefined}
          trend={pf.history.map((h) => h.total)}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Net salary, last 6 months"
          unit="₹, paid vs pending"
          isEmpty={trend.length === 0}
          legend={
            <>
              <LegendItem color="var(--chart-1)" label="Paid" />
              <LegendItem color="var(--chart-4)" label="Pending" />
              <LegendItem color="var(--chart-5)" label="On hold" />
            </>
          }
        >
          <ChartContainer config={salaryConfig} className="h-full w-full">
            <BarChart data={trend} margin={{ left: 0, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatINRAxis} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} tickCount={4} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, name) => `${salaryConfig[name as keyof typeof salaryConfig]?.label ?? name}: ${formatINR(Number(v), { compact: true })}`} />} />
              <Bar dataKey="paid" stackId="s" fill="var(--chart-1)" stroke="var(--accent-strong)" strokeWidth={1} />
              <Bar dataKey="pending" stackId="s" fill="var(--chart-4)" />
              <Bar dataKey="onHold" stackId="s" fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard title="PF contribution, last 6 months" unit="₹, employee + employer share" isEmpty={trend.length === 0} legend={<LegendItem color="var(--chart-1)" label="PF total" />}>
          <ChartContainer config={pfConfig} className="h-full w-full">
            <BarChart data={trend} margin={{ left: 0, right: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={formatINRAxis} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} tickCount={4} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatINR(Number(v), { compact: true })} />} />
              <Bar dataKey="pf" fill="var(--chart-1)" stroke="var(--accent-strong)" strokeWidth={1} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </ChartCard>
      </div>

      <section className="mt-6" aria-label="PF status by month">
        <h2 className="mb-2 text-sm font-semibold">PF status by month</h2>
        <div className="divide-y rounded-lg border bg-surface">
          {[...pf.history].reverse().map((h) => {
            const t = PF_TONE[h.status];
            return (
              <div key={h.period} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{formatMonth(h.period)}</p>
                  <p className="text-xs text-muted-foreground">Due 15th of next month</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular text-sm">{formatINR(h.total)}</span>
                  <StatusBadge tone={t.tone} label={t.label} />
                </div>
              </div>
            );
          })}
        </div>
        {pfTone && pf.status !== "REMITTED" && (
          <p className="mt-2 text-xs text-muted-foreground">
            {pf.members} members for {month}: employee share {formatINR(pf.employeeShare)}, employer share {formatINR(pf.employerShare)}.
          </p>
        )}
      </section>

      {salary.runs.length > 0 && (
        <section className="mt-6" aria-label="Payroll runs">
          <h2 className="mb-2 text-sm font-semibold">Payroll runs, {month}</h2>
          <div className="divide-y rounded-lg border bg-surface">
            {salary.runs.map((r) => (
              <div key={r.region} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm">{r.region}</p>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
