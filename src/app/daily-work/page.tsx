"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ClipboardCheck, ClipboardList, Plus, Users } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterPills, Section } from "@/components/work/parts";
import { getDailyReports, getManpowerTrend, getMissingReports, listSiteIssues } from "@/lib/data";
import { formatDate, getToday } from "@/lib/dates";
import { useDb, useRegionFilter } from "@/store/hooks";
import type { DailyWorkReport } from "@/types";

type Filter = "ALL" | "SUBMITTED" | "REVIEWED";
const axis = { fontSize: 11, fill: "var(--text-secondary)" };

export default function Page() {
  const db = useDb();
  const { region } = useRegionFilter();
  const [filter, setFilter] = useState<Filter>("ALL");
  const today = getToday();
  const projectName = (id: string) => db.projects.find((p) => p.id === id)?.name ?? "—";
  const siteName = (id: string) => db.sites.find((s) => s.id === id)?.name ?? "—";

  const reports = useMemo(() => getDailyReports(db, { region }), [db, region]);
  const missing = useMemo(() => getMissingReports(db, today, region), [db, today, region]);
  const trend = useMemo(() => getManpowerTrend(db, region, 14).map((d) => ({ ...d, label: formatDate(d.date).slice(0, 5) })), [db, region]);
  const openIssues = listSiteIssues(db, region, true).length;
  const toReview = reports.filter((r) => r.status === "SUBMITTED").length;
  const todays = reports.filter((r) => r.reportDate === today);
  const rows = reports.filter((r) => filter === "ALL" || r.status === filter);

  const columns: DataTableColumn<DailyWorkReport>[] = [
    {
      key: "p",
      header: "Project",
      mobile: "title",
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium">{projectName(r.projectId)}</p>
          <p className="text-xs text-muted-foreground">{siteName(r.siteId)}</p>
        </div>
      ),
    },
    { key: "d", header: "Date", sortValue: (r) => r.reportDate, cell: (r) => formatDate(r.reportDate) },
    { key: "w", header: "Workers", numeric: true, cell: (r) => r.workersCount },
    { key: "i", header: "Issues", cell: (r) => <span className="line-clamp-1 text-muted-foreground">{r.issues ?? "None"}</span> },
    { key: "ph", header: "Photos", numeric: true, cell: (r) => r.photoCount },
    { key: "s", header: "Status", mobile: "badge", cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <>
      <PageHeader title="Daily Work" description="Site reports, manpower and issues." primaryAction={{ label: "New report", icon: Plus, href: "/daily-work/new" }} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Reports today" value={String(todays.length)} icon={ClipboardList} hint={`${missing.length} missing`} />
        <KpiTile label="To review" value={String(toReview)} icon={ClipboardCheck} hint="Submitted, not reviewed" />
        <KpiTile label="Workers today" value={String(todays.reduce((t, r) => t + r.workersCount, 0))} icon={Users} trend={trend.map((d) => d.workers)} />
        <KpiTile label="Open issues" value={String(openIssues)} icon={AlertTriangle} hint="Across sites" />
      </div>

      {missing.length > 0 && (
        <Section title={`Missing today (${missing.length})`} className="mb-6">
          <ul className="divide-y rounded-lg border bg-surface">
            {missing.map((m) => (
              <li key={m.project.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{m.project.name}</span>
                  <span className="block text-xs text-muted-foreground">{m.site.name}</span>
                </span>
                <Link href={`/daily-work/new?project=${m.project.id}`} className="shrink-0 text-sm font-medium text-accent-strong hover:underline">
                  Submit report
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <ChartCard title="Daily manpower" unit="Workers reported, last 14 days" isEmpty={trend.every((d) => d.workers === 0)} className="mb-6">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={trend} margin={{ left: -16, right: 8, top: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis tick={axis} tickLine={false} axisLine={false} />
            <Tooltip formatter={(v) => [`${v} workers`, ""]} />
            <Bar dataKey="workers" fill="var(--chart-1)" stroke="var(--accent-strong)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <Section title="Reports">
        <DataTable
          caption="Daily work reports"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          getRowHref={(r) => `/daily-work/${r.id}`}
          pageSize={15}
          search={{ placeholder: "Search project or site", getText: (r) => `${projectName(r.projectId)} ${siteName(r.siteId)} ${r.issues ?? ""}` }}
          toolbar={
            <FilterPills
              value={filter}
              onChange={setFilter}
              options={[
                { key: "ALL", label: "All" },
                { key: "SUBMITTED", label: "To review" },
                { key: "REVIEWED", label: "Reviewed" },
              ]}
            />
          }
          emptyMessage="No reports match this filter."
        />
      </Section>
    </>
  );
}
