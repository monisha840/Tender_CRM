"use client";

import { useMemo } from "react";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { DeadlineBadge, StageBadge, StatusBadge } from "@/components/shared/status-badge";
import { entityHref, listProjects, type ProjectRow, type TenderRow } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { PHASE67_ENABLED } from "@/lib/features";
import { formatINR, moneyToNumber } from "@/lib/money";
import { useCurrentPersona } from "@/store/hooks";
import { useAsOfDb } from "@/components/layout/use-as-of-db";
import { AttentionArea } from "./attention";
import { GstFilingChart, ProjectHealthChart, ReceivablesAgeingChart, RevenueExpensesChart, ServiceLineValueChart, TenderFunnelChart, WinRateChart } from "./charts";
import { cancelledTenders, wonStageLabel } from "./derive";
import type { ViewProps } from "./director-view";
import { KpiGrid } from "./kpi-grid";

/** Accounts / Finance: money first. */
export function FinanceView({ dashboard, manpower, region }: ViewProps) {
  if (!PHASE67_ENABLED) return <AttentionArea region={region} only={["approvals"]} />;
  const rows = dashboard.receivables.byOrganisation;
  const columns: DataTableColumn<(typeof rows)[number]>[] = [
    { key: "name", header: "Customer", cell: (r) => r.name, mobile: "title", sortValue: (r) => r.name },
    { key: "o", header: "Outstanding", cell: (r) => formatINR(r.outstanding, { compact: "auto" }), numeric: true, sortValue: (r) => moneyToNumber(r.outstanding) },
  ];
  return (
    <>
      <AttentionArea region={region} only={["receivables", "salary", "approvals"]} />
      <KpiGrid dashboard={dashboard} manpower={manpower} only={[12, 13, 11, 7, 9, 10]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <RevenueExpensesChart data={dashboard.revenueExpenses} />
        <ReceivablesAgeingChart data={dashboard.receivables} />
        <GstFilingChart data={dashboard.gst} />
        <section className="min-w-0 rounded-lg border bg-surface p-4">
          <h2 className="text-sm font-semibold">Receivables by customer</h2>
          <p className="mb-3 text-xs text-muted-foreground">Outstanding balance, largest first</p>
          <DataTable caption="Receivables by customer" columns={columns} rows={rows} getRowId={(r) => r.organisationId} getRowHref={(r) => `/finance?view=receivables&customer=${r.organisationId}`} pageSize={6} emptyMessage="No outstanding receivables." />
        </section>
      </div>
    </>
  );
}

/** Project Manager: their projects, subcontractors and progress. */
export function ProjectsView({ dashboard, manpower, region }: ViewProps) {
  const db = useAsOfDb();
  const persona = useCurrentPersona();
  const rows = useMemo(() => {
    const employee = db.employees.find((e) => e.userId === persona.user.id);
    const all = listProjects(db, region).filter((r) => r.status.systemKey !== "COMPLETED");
    const mine = all.filter((r) => r.project.projectManagerId === employee?.id);
    return mine.length ? mine : all;
  }, [db, region, persona.user.id]);
  const columns: DataTableColumn<ProjectRow>[] = [
    { key: "n", header: "Project", cell: (r) => <span>{r.project.name}<span className="block text-xs text-muted-foreground">{r.project.code} · {r.site?.name ?? "—"}</span></span>, mobile: "title", sortValue: (r) => r.project.name },
    { key: "h", header: "Health", cell: (r) => <StatusBadge status={r.health} />, mobile: "badge", sortValue: (r) => r.gapPct },
    { key: "p", header: "Progress", cell: (r) => `${Math.round(r.progressPct)}% of ${Math.round(r.plannedPct)}% planned`, numeric: true, sortValue: (r) => r.progressPct },
    { key: "v", header: "Value", cell: (r) => formatINR(r.project.contractValue, { compact: "auto" }), numeric: true, sortValue: (r) => moneyToNumber(r.project.contractValue) },
    { key: "e", header: "Ends", cell: (r) => (r.project.plannedEndDate ? formatDate(r.project.plannedEndDate) : "—"), numeric: true },
  ];
  return (
    <>
      <AttentionArea region={region} only={["approvals"]} />
      <KpiGrid dashboard={dashboard} manpower={manpower} only={[4, 5, 6, 7, 8]} />
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="text-sm font-semibold">Projects I manage</h2>
        <p className="mb-3 text-xs text-muted-foreground">Active projects with health against the time plan</p>
        <DataTable caption="Active projects" columns={columns} rows={rows} getRowId={(r) => r.project.id} getRowHref={(r) => entityHref("PROJECT", r.project.id)} pageSize={8} emptyMessage="No active projects in this region." />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <ProjectHealthChart data={dashboard.activeProjects} />
        <ServiceLineValueChart data={dashboard.projectValue} />
      </div>
    </>
  );
}

/** Tender Executive and Legal / Admin: pipeline and deadlines. */
export function TenderView({ dashboard, manpower, region }: ViewProps) {
  const db = useAsOfDb();
  const cancelled = useMemo(() => cancelledTenders(db, region), [db, region]);
  const rows = dashboard.upcomingDeadlines.rows;
  const columns: DataTableColumn<TenderRow>[] = [
    { key: "t", header: "Tender", cell: (r) => <span>{r.tender.title}<span className="block text-xs text-muted-foreground">{r.tender.tenderNo} · {r.organisationName}</span></span>, mobile: "title", sortValue: (r) => r.tender.title },
    { key: "s", header: "Stage", cell: (r) => <StageBadge name={r.stage.name} kind={r.stage.kind} color={r.stage.color} />, mobile: "badge" },
    { key: "d", header: "Bid deadline", cell: (r) => <DeadlineBadge value={r.tender.submissionDeadlineAt} />, sortValue: (r) => r.daysToDeadline },
    { key: "v", header: "Estimated value", cell: (r) => formatINR(r.tender.estimatedValue, { compact: "auto" }), numeric: true, sortValue: (r) => moneyToNumber(r.tender.estimatedValue) },
  ];
  return (
    <>
      <AttentionArea region={region} only={["deadlines", "approvals"]} />
      <KpiGrid dashboard={dashboard} manpower={manpower} only={[1, 2, 3]} />
      <section className="rounded-lg border bg-surface p-4">
        <h2 className="text-sm font-semibold">Bids due in the next 7 days</h2>
        <p className="mb-3 text-xs text-muted-foreground">Soonest first</p>
        <DataTable caption="Upcoming tender deadlines" columns={columns} rows={rows} getRowId={(r) => r.tender.id} getRowHref={(r) => entityHref("TENDER", r.tender.id)} pageSize={8} emptyMessage="No bids due this week." />
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <TenderFunnelChart data={dashboard.activeTenders} wonLabel={wonStageLabel(db)} wonCount={dashboard.wonLost.won} wonValue={moneyToNumber(dashboard.wonLost.wonValue)} />
        <WinRateChart data={dashboard.wonLost} cancelled={cancelled} />
      </div>
    </>
  );
}
