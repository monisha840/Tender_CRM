"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ClipboardCheck, ClipboardList, Plus, Users } from "lucide-react";
import { ChartCard } from "@/components/charts/chart-card";
import { ImportExport } from "@/components/data/import-export";
import { RecordForm } from "@/components/data/record-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterPills, Section } from "@/components/work/parts";
import { getDailyReports, getManpowerTrend, getMissingReports, listSiteIssues } from "@/lib/data";
import { formatDate, getToday } from "@/lib/dates";
import { useUrlParam } from "@/lib/use-url-param";
import { newId } from "@/modules/finance/entry";
import { useDataStore } from "@/store/data-store";
import { useCurrentPersona, useDb, useRegionFilter } from "@/store/hooks";
import type { DailyWorkReport } from "@/types";

type Filter = "ALL" | "SUBMITTED" | "REVIEWED";
const axis = { fontSize: 11, fill: "var(--text-secondary)" };

export default function Page() {
  const db = useDb();
  const { region } = useRegionFilter();
  const persona = useCurrentPersona();
  const upsert = useDataStore((s) => s.upsert);
  const [reportingIssue, setReportingIssue] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");
  const siteParam = useUrlParam("site");
  const focusParam = useUrlParam("focus");
  const tabParam = useUrlParam("tab");
  const today = getToday();
  const projectName = (id: string) => db.projects.find((p) => p.id === id)?.name ?? "—";
  const siteName = (id: string) => db.sites.find((s) => s.id === id)?.name ?? "—";

  const reports = useMemo(() => getDailyReports(db, { region }), [db, region]);
  const missing = useMemo(() => getMissingReports(db, today, region), [db, today, region]);
  const trend = useMemo(() => getManpowerTrend(db, region, 14).map((d) => ({ ...d, label: formatDate(d.date).slice(0, 5) })), [db, region]);
  const openIssues = listSiteIssues(db, region, true).length;
  const toReview = reports.filter((r) => r.status === "SUBMITTED").length;
  const todays = reports.filter((r) => r.reportDate === today);
  const rows = reports.filter((r) => (filter === "ALL" || r.status === filter) && (!siteParam || r.siteId === siteParam));
  const issues = useMemo(() => listSiteIssues(db, region, true), [db, region]);
  useEffect(() => {
    if (tabParam === "issues") document.getElementById("open-issues")?.scrollIntoView({ block: "start" });
  }, [tabParam]);

  const activeProjects = db.projects.filter((p) => !p.deletedAt);
  const saveIssue = (v: Record<string, string>): string | void => {
    const p = activeProjects.find((x) => x.id === v.projectId);
    if (!p) return "Choose a project.";
    const now = new Date().toISOString();
    upsert("siteIssues", {
      id: newId("iss_new"),
      createdAt: now,
      updatedAt: now,
      siteId: p.siteId,
      projectId: p.id,
      regionId: p.regionId,
      reportId: null,
      title: v.title,
      severity: v.severity as "LOW" | "MEDIUM" | "HIGH",
      status: "OPEN",
      raisedById: persona.user.id,
      raisedOn: today,
    });
    toast.success("Issue reported", { description: v.title });
  };

  const importReports = (records: Record<string, string>[]) => {
    const errors: string[] = [];
    let imported = 0;
    records.forEach((r, i) => {
      const row = `Row ${i + 2}`;
      const q = (r["Project"] ?? "").trim().toLowerCase();
      const p = activeProjects.find((x) => x.id === r["Project"] || x.code.toLowerCase() === q || x.name.toLowerCase() === q);
      const date = r["Date"] ?? "";
      const workers = Number(r["Workers"]);
      if (!p) return void errors.push(`${row}: project "${r["Project"] ?? ""}" not found`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return void errors.push(`${row}: date must be YYYY-MM-DD`);
      if (date > today) return void errors.push(`${row}: date is in the future`);
      if (!Number.isInteger(workers) || workers < 0) return void errors.push(`${row}: workers must be a whole number`);
      const dup = useDataStore.getState().db.dailyReports.some((x) => x.projectId === p.id && x.reportDate === date && !x.deletedAt);
      if (dup) return void errors.push(`${row}: a report for ${p.name} on ${date} already exists`);
      const now = new Date().toISOString();
      upsert("dailyReports", {
        id: newId("dr_imp"),
        createdAt: now,
        updatedAt: now,
        siteId: p.siteId,
        projectId: p.id,
        regionId: p.regionId,
        reportDate: date,
        status: "SUBMITTED",
        workersCount: workers,
        issues: r["Issues"] || null,
        planForTomorrow: r["Plan"] || null,
        photoCount: 0,
        submittedById: persona.user.id,
        submittedAt: now,
      });
      imported++;
    });
    return { imported, errors };
  };

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
      <PageHeader title="Daily Work" description="Site reports, manpower and issues." primaryAction={{ label: "New report", icon: Plus, href: "/daily-work/new" }}
        secondaryActions={[{ label: "Report issue", icon: AlertTriangle, onClick: () => setReportingIssue(true) }]}
      />
      {reportingIssue && (
        <RecordForm
          open
          onOpenChange={setReportingIssue}
          title="Report issue"
          description="Raised against a project and its plant site."
          submitLabel="Report issue"
          onSubmit={saveIssue}
          fields={[
            { name: "projectId", label: "Project / site", type: "select", required: true, defaultValue: siteParam ? activeProjects.find((p) => p.siteId === siteParam)?.id : undefined, options: activeProjects.map((p) => ({ value: p.id, label: `${p.name} (${siteName(p.siteId)})` })) },
            { name: "title", label: "Issue", required: true, placeholder: "What is the problem?" },
            { name: "severity", label: "Severity", type: "select", required: true, defaultValue: "MEDIUM", options: [{ value: "LOW", label: "Low" }, { value: "MEDIUM", label: "Medium" }, { value: "HIGH", label: "High" }] },
          ]}
        />
      )}
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
              <li key={m.project.id} className="flex min-h-11 items-center justify-between gap-3 border-l-4 border-l-status-warning px-4 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{m.project.name}</span>
                  <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-status-warning"><AlertTriangle className="size-3" aria-hidden="true" />Missing today</span>
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

      <div id="open-issues" className="scroll-mt-20">
        <Section
          title={`Open issues (${issues.length})`}
          className="mb-6"
          action={
            <Button variant="outline" size="sm" className="min-h-11 md:min-h-8" onClick={() => setReportingIssue(true)}>
              <AlertTriangle data-icon="inline-start" aria-hidden="true" /> Report issue
            </Button>
          }
        >
          {issues.length === 0 ? (
            <p className="rounded-lg border bg-surface px-4 py-3 text-sm text-muted-foreground">No open site issues.</p>
          ) : (
            <ul className="divide-y rounded-lg border bg-surface">
              {issues.map((i) => (
                <li key={i.id} className={`flex min-h-11 items-center justify-between gap-3 px-4 py-2 text-sm ${i.severity === "HIGH" ? "border-l-4 border-l-status-danger bg-status-danger/5" : ""} ${focusParam === i.id ? "bg-accent-subtle" : ""}`}>
                  <span className="min-w-0">
                    <span className="font-medium">{i.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {siteName(i.siteId)} · {projectName(i.projectId)} · raised {formatDate(i.raisedOn)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={i.severity} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title={siteParam ? `Reports · ${siteName(siteParam)}` : "Reports"}>
        <ImportExport
          filename="daily-work-reports"
          headers={["Date", "Project", "Site", "Workers", "Issues", "Photos", "Status", "Plan"]}
          rows={rows.map((r) => [r.reportDate, projectName(r.projectId), siteName(r.siteId), r.workersCount, r.issues ?? "", r.photoCount, r.status, r.planForTomorrow ?? ""])}
          onImport={importReports}
        />
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
