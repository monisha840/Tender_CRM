"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, HardHat, MapPin, Users } from "lucide-react";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { ChartTooltipContent } from "@/components/charts/chart-tooltip";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { countAttendanceNotMarked, getAttendanceSummary, listSiteIssues, listSites, type RegionFilter } from "@/lib/data";
import { formatDate, getToday, lastNDays } from "@/lib/dates";
import { PHASE67_ENABLED } from "@/lib/features";
import { useCurrentPersona } from "@/store/hooks";
import { useAsOfDb } from "@/components/layout/use-as-of-db";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

const TICK = { fill: "var(--text-secondary)", fontSize: 11 };

/** Site Engineer / Supervisor: their plant site, today's reports, manpower and open issues. Mobile-first. */
export function SiteView({ region }: { region: RegionFilter }) {
  const db = useAsOfDb();
  const persona = useCurrentPersona();
  const today = getToday();

  const view = useMemo(() => {
    const employee = db.employees.find((e) => e.userId === persona.user.id);
    const assignment = db.siteAssignments.find((a) => a.employeeId === employee?.id && (!a.toDate || a.toDate >= today));
    const sites = listSites(db, region);
    const row = sites.find((s) => s.site.id === assignment?.siteId) ?? sites[0];
    if (!row) return null;
    const projectIds = new Set(row.projects.map((p) => p.id));
    const reports = db.dailyReports.filter((r) => projectIds.has(r.projectId));
    const trend = lastNDays(14).map((date) => ({ date, label: date.slice(8) + "/" + date.slice(5, 7), workers: reports.filter((r) => r.reportDate === date).reduce((a, r) => a + r.workersCount, 0) }));
    return {
      row,
      reports,
      trend,
      issues: listSiteIssues(db, region, true).filter((i) => i.siteId === row.site.id),
      attendance: getAttendanceSummary(db, today, region),
      notMarked: countAttendanceNotMarked(db, today, region),
    };
  }, [db, region, persona.user.id, today]);

  if (!view) return <EmptyState icon={HardHat} message="No plant site is assigned to you yet." />;
  const { row, reports, trend, issues, attendance, notMarked } = view;
  const config = { workers: { label: "Workers", color: "var(--chart-1)" } } satisfies ChartConfig;
  const todayReport = (projectId: string) => reports.find((r) => r.projectId === projectId && r.reportDate === today);
  const missing = row.projects.filter((p) => !todayReport(p.id) || todayReport(p.id)!.status === "DRAFT");

  return (
    <>
      <section className="rounded-lg border bg-surface p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <MapPin className="size-4 text-accent-strong" aria-hidden="true" />
          <h2 className="text-base font-semibold">{row.site.name}</h2>
          <StatusBadge status={row.site.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {row.organisationName} · {row.regionName} · reports due by {row.site.reportCutoffTime} · {row.site.address}
        </p>
        {missing.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 rounded-md bg-status-warning-tint p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-sm font-medium text-status-warning">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              {missing.length} daily report{missing.length === 1 ? "" : "s"} not submitted today: {missing.map((p) => p.name).join(", ")}
            </p>
            <Link href="/daily-work" className="inline-flex min-h-11 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground">
              Submit report
            </Link>
          </div>
        ) : (
          <p className="mt-4 flex items-center gap-2 rounded-md bg-status-success-tint p-3 text-sm font-medium text-status-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            All of today&apos;s daily reports are submitted.
          </p>
        )}
      </section>

      <section aria-label="Site figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Workers today" value={String(trend[trend.length - 1].workers)} hint="from today's reports" icon={Users} trend={trend.map((t) => t.workers)} href="/daily-work" />
        <KpiTile label="Reports today" value={`${row.reportsToday} / ${row.reportsExpected}`} hint={formatDate(today)} icon={ClipboardList} href="/daily-work" />
        <KpiTile label="Open issues" value={String(issues.length)} hint={`${issues.filter((i) => i.severity === "HIGH").length} high severity`} icon={AlertTriangle} href="/daily-work?tab=issues" />
        {PHASE67_ENABLED && <KpiTile label="Attendance not marked" value={String(notMarked)} hint={`${attendance.present} present today`} icon={HardHat} href="/employees/attendance" />}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border bg-surface">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Projects at this site</h2>
          <ul className="divide-y">
            {row.projects.map((p) => {
              const r = todayReport(p.id);
              return (
                <li key={p.id}>
                  <Link href={`/daily-work?site=${row.site.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 hover:bg-accent-subtle">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.code} · {p.workOrderNo}</span>
                    </span>
                    <StatusBadge status={r && r.status !== "DRAFT" ? "SUBMITTED" : "PENDING"} label={r && r.status !== "DRAFT" ? "Report submitted" : "Report due"} />
                  </Link>
                </li>
              );
            })}
            {row.projects.length === 0 && <li><EmptyState message="No projects are running at this site." /></li>}
          </ul>
        </section>
        <section className="rounded-lg border bg-surface">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Open site issues</h2>
          <ul className="divide-y">
            {issues.slice(0, 5).map((i) => (
              <li key={i.id}>
                <Link href={`/daily-work?tab=issues&focus=${i.id}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-2 hover:bg-accent-subtle">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{i.title}</span>
                    <span className="block text-xs text-muted-foreground">Raised {formatDate(i.raisedOn)}</span>
                  </span>
                  <StatusBadge status={i.severity} />
                </Link>
              </li>
            ))}
            {issues.length === 0 && <li><EmptyState message="No open issues at this site." /></li>}
          </ul>
        </section>
      </div>

      <ChartCard title="Manpower at this site" unit="Workers reported per day, last 14 days" action={<Link href="/daily-work" className="text-xs font-medium text-accent-strong hover:underline">Daily reports</Link>} legend={<LegendItem color="var(--chart-1)" label="Workers" />} isEmpty={trend.every((t) => t.workers === 0)}>
        <ChartContainer config={config} className="h-full w-full">
          <BarChart data={trend} margin={{ left: 0, right: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={TICK} interval={2} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={TICK} width={32} tickCount={4} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="workers" fill="var(--chart-1)" stroke="var(--accent-strong)" strokeWidth={1} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </ChartCard>
    </>
  );
}
