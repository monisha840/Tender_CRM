"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { FileText, Gavel, HardHat, Plus, Wallet } from "lucide-react";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiTile } from "@/components/shared/kpi-tile";
import { DeadlineBadge, StageBadge, StatusBadge } from "@/components/shared/status-badge";
import { Timeline } from "@/components/shared/timeline";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatINR, formatINRAxis } from "@/lib/money";
import {
  getDashboardKpis,
  getTender,
  getTenderPipeline,
  listTenders,
  type TenderRow,
} from "@/lib/data";
import { useDb, useRegionFilter } from "@/store/hooks";

const chartConfig = { value: { label: "Estimated value", color: "var(--chart-1)" } } satisfies ChartConfig;

/** Living reference for the shared components, driven by the seed data. Not part of the product nav. */
export default function StyleguidePage() {
  const db = useDb();
  const { region } = useRegionFilter();
  const tenders = useMemo(() => listTenders(db, { region }), [db, region]);
  const kpis = useMemo(() => getDashboardKpis(db, region), [db, region]);
  const pipeline = useMemo(() => getTenderPipeline(db, region).map((p) => ({ stage: p.stage.name, value: p.value })), [db, region]);
  const flagship = useMemo(() => getTender(db, "tnd_p10_kpcl_pkg"), [db]);

  const columns: DataTableColumn<TenderRow>[] = [
    { key: "title", header: "Tender", mobile: "title", sortValue: (r) => r.tender.title, cell: (r) => <span className="line-clamp-2">{r.tender.title}</span>, className: "max-w-sm" },
    { key: "stage", header: "Stage", mobile: "badge", cell: (r) => <StageBadge name={r.stage.name} kind={r.stage.kind} /> },
    { key: "client", header: "Organisation", sortValue: (r) => r.organisationName, cell: (r) => r.organisationName },
    { key: "region", header: "Region", cell: (r) => r.regionName },
    { key: "value", header: "Estimate", numeric: true, sortValue: (r) => Number(r.tender.estimatedValue), cell: (r) => formatINR(r.tender.estimatedValue, { compact: "auto" }) },
    { key: "deadline", header: "Deadline", sortValue: (r) => r.tender.submissionDeadlineAt, cell: (r) => (r.daysToDeadline >= 0 && r.stage.kind === "OPEN" ? <DeadlineBadge value={r.tender.submissionDeadlineAt} /> : formatDate(r.tender.submissionDeadlineAt)) },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        title="Styleguide"
        description="Shared components on seed data. Check this page at 360, 768 and 1280px."
        status={<StatusBadge status="GREEN" />}
        primaryAction={{ label: "New tender", icon: Plus, href: "/tenders" }}
        secondaryActions={[{ label: "Export", icon: FileText, onClick: () => undefined }, { label: "Duplicate", onClick: () => undefined }]}
      />

      <section className="space-y-3" aria-labelledby="sg-kpi">
        <h2 id="sg-kpi" className="text-base font-semibold">KPI tiles</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Active tenders" value={String(kpis.activeTenders)} hint={`${formatINR(kpis.pipelineValue, { compact: true })} pipeline`} icon={Gavel} href="/tenders" />
          <KpiTile label="Receivables" value={formatINR(kpis.receivables, { compact: true })} hint={`${formatINR(kpis.receivablesOverdue, { compact: true })} overdue`} icon={Wallet} delta={{ text: "overdue", direction: "up", good: false }} href="/finance" />
          <KpiTile label="Workers on site today" value={String(kpis.workersToday)} icon={HardHat} trend={kpis.manpowerTrend} href="/daily-work" />
          <KpiTile label="Win rate" value={kpis.winRate === null ? "—" : `${kpis.winRate}%`} hint="decided tenders" />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="sg-badges">
        <h2 id="sg-badges" className="text-base font-semibold">Status badges (colour + icon + label)</h2>
        <div className="flex flex-wrap gap-2">
          {["APPROVED", "PENDING", "REJECTED", "DRAFT", "SUBMITTED", "GREEN", "AMBER", "RED", "PARTLY_PAID", "OVERDUE"].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <DeadlineBadge value="2026-10-05" />
          <DeadlineBadge value="2026-10-08" />
          <DeadlineBadge value="2026-10-12" />
          <DeadlineBadge value="2026-10-30" />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="sg-table">
        <h2 id="sg-table" className="text-base font-semibold">DataTable: table from 768px, stacked cards below</h2>
        <DataTable
          caption="Tenders"
          columns={columns}
          rows={tenders}
          getRowId={(r) => r.tender.id}
          getRowHref={(r) => `/tenders?focus=${r.tender.id}`}
          search={{ placeholder: "Search tenders", getText: (r) => `${r.tender.title} ${r.tender.tenderNo} ${r.organisationName}` }}
          pageSize={8}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Tender pipeline by stage" unit="Estimated value, ₹" legend={<LegendItem color="var(--chart-1)" label="Open tenders" />} isEmpty={pipeline.every((p) => p.value === 0)}>
          <ChartContainer config={chartConfig} className="h-full w-full">
            <BarChart data={pipeline} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tickFormatter={formatINRAxis} tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} tickCount={4} />
              <YAxis type="category" dataKey="stage" width={104} tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatINR(Number(v), { compact: true })} />} />
              <Bar dataKey="value" fill="var(--chart-1)" radius={3} />
            </BarChart>
          </ChartContainer>
        </ChartCard>

        <ChartCard title="Empty chart" unit="Shows a sensible empty state" isEmpty heightClassName="h-40">
          <span />
        </ChartCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3" aria-labelledby="sg-timeline">
          <h2 id="sg-timeline" className="text-base font-semibold">Timeline: Raichur package tender stages</h2>
          <div className="rounded-lg border bg-surface p-4">
            {flagship && (
              <Timeline
                entries={[
                  ...flagship.history.map((h, i) => ({
                    id: `h${i}`,
                    title: h.toStage,
                    time: formatDateTime(h.at),
                    by: h.by,
                    description: h.reason ?? undefined,
                    tone: (i === flagship.history.length - 1 ? "success" : "accent") as "success" | "accent",
                  })),
                ]}
              />
            )}
          </div>
        </section>

        <section className="space-y-3" aria-labelledby="sg-empty">
          <h2 id="sg-empty" className="text-base font-semibold">Empty state</h2>
          <div className="rounded-lg border bg-surface">
            <EmptyState icon={Gavel} message="Tenders you register will be listed here." action={{ label: "Register a tender", href: "/tenders" }} />
          </div>
        </section>
      </div>
    </div>
  );
}
