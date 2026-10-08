"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CalendarClock, ChevronRight, Gavel, Percent, Plus, Search, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiTile } from "@/components/shared/kpi-tile";
import { DeadlineBadge, StageBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getStageCounts, getTenderStats, listTenders, type TenderRow } from "@/lib/data/tenders";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { setUrlParam, useUrlParam, useUrlState } from "@/lib/use-url-param";
import { useRegionFilter } from "@/store/hooks";
import { useAsOfDb } from "@/components/layout/use-as-of-db";
import { useTenderRoles } from "./action-helpers";
import { DeadlineList } from "./deadline-list";
import { FilterSelect, type FilterOption } from "./parts";
import { matchesTenderKind, parseTenderKind } from "./result-filter";
import { AddTenderForm, TenderImportExport } from "./tender-entry";
import { tenderTone, toneClass } from "./urgency";
import { StageChart, WonLostChart } from "./tender-charts";

const ALL = "ALL";

const DEADLINE_OPTIONS: FilterOption[] = [
  { value: ALL, label: "Any deadline" },
  { value: "OVERDUE", label: "Deadline passed" },
  { value: "7", label: "Next 7 days" },
  { value: "30", label: "Next 30 days" },
];

/** Upcoming deadlines first (soonest at the top), then past ones, most recent first. */
const byRelevance = (a: TenderRow, b: TenderRow) => {
  const aFuture = a.daysToDeadline >= 0;
  const bFuture = b.daysToDeadline >= 0;
  if (aFuture !== bFuture) return aFuture ? -1 : 1;
  return aFuture ? a.daysToDeadline - b.daysToDeadline : b.daysToDeadline - a.daysToDeadline;
};

const COLUMNS: DataTableColumn<TenderRow>[] = [
  {
    key: "tender",
    header: "Tender",
    mobile: "title",
    sortValue: (r) => r.tender.title,
    cell: (r) => (
      <span className="block min-w-40 max-w-sm">
        <span className="break-words md:line-clamp-2">{r.tender.title}</span>
        <span className="block text-xs font-normal text-muted-foreground">{r.tender.tenderNo}</span>
      </span>
    ),
  },
  { key: "org", header: "Organisation", sortValue: (r) => r.organisationName, cell: (r) => <span title={r.organisationName}>{r.organisationShort}</span> },
  { key: "sl", header: "Service line", sortValue: (r) => r.serviceLineName, cell: (r) => <span className="md:line-clamp-2 md:max-w-36">{r.serviceLineName}</span> },
  { key: "region", header: "Region", mobile: "detail", sortValue: (r) => r.regionName, cell: (r) => r.regionName },
  {
    key: "value",
    header: "Est. value",
    numeric: true,
    sortValue: (r) => Number(r.tender.estimatedValue),
    cell: (r) => <span className="whitespace-nowrap">{formatINR(r.tender.estimatedValue, { compact: "auto" })}</span>,
  },
  { key: "emd", header: "EMD", numeric: true, sortValue: (r) => Number(r.tender.emdAmount), cell: (r) => <span className="whitespace-nowrap">{formatINR(r.tender.emdAmount, { compact: "auto" })}</span> },
  {
    key: "deadline",
    header: "Submission / opening",
    sortValue: (r) => r.tender.submissionDeadlineAt,
    cell: (r) => (
      <span className="flex flex-col items-start gap-0.5 md:py-0.5">
        <span className="tabular whitespace-nowrap">{formatDate(r.tender.submissionDeadlineAt)}</span>
        {r.stage.kind === "OPEN" && r.stage.systemKey !== "SUBMITTED" && <DeadlineBadge value={r.tender.submissionDeadlineAt} />}
        <span className="tabular text-xs whitespace-nowrap text-muted-foreground">Opens {formatDate(r.tender.openingDate)}</span>
      </span>
    ),
  },
  {
    key: "stage",
    header: "Status",
    mobile: "badge",
    sortValue: (r) => r.stage.sequence,
    cell: (r) => <StageBadge name={r.stage.name} kind={r.stage.kind} color={r.stage.color} />,
  },
];

export function TenderList() {
  const db = useAsOfDb();
  const { region, setRegion, options: regionOptions } = useRegionFilter();
  // Filters live in the URL so they survive a refresh, the back button and a shared link. Dashboard links arrive as
  // ?status=open (live tenders), ?result=decided (won or lost) and ?stage=<stage id>; picking another chip replaces them.
  const [stageParam, setStageId] = useUrlState("stage", ALL);
  const [orgId, setOrgId] = useUrlState("org", ALL);
  const [lineId, setLineId] = useUrlState("line", ALL);
  const [deadline, setDeadline] = useUrlState("deadline", ALL);
  const [query, setQuery] = useUrlState("q");
  const [adding, setAdding] = useState(false);
  const { canWrite } = useTenderRoles();
  const statusParam = useUrlParam("status");
  const resultParam = useUrlParam("result");
  const kind = parseTenderKind(statusParam, resultParam);
  const clearKind = () => {
    setUrlParam("status", null);
    setUrlParam("result", null);
  };

  // Everything in the region, before the other filters: the count bar and charts describe this set.
  const regionRows = useMemo(() => listTenders(db, { region }), [db, region]);
  const stats = useMemo(() => getTenderStats(db, region), [db, region]);
  const stageCounts = useMemo(() => getStageCounts(db, regionRows), [db, regionRows]);
  // A stale or hand-typed ?stage= that matches no stage is ignored rather than showing an empty list.
  const stageId = stageCounts.some((c) => c.stage.id === stageParam) ? stageParam : ALL;

  const rows = useMemo(
    () =>
      regionRows
        .filter((r) => stageId === ALL || r.stage.id === stageId)
        .filter((r) => !kind || matchesTenderKind(kind, r, db))
        .filter((r) => orgId === ALL || r.tender.organisationId === orgId)
        .filter((r) => lineId === ALL || r.tender.serviceLineId === lineId)
        .filter((r) => {
          if (deadline === ALL) return true;
          if (deadline === "OVERDUE") return r.daysToDeadline < 0;
          return r.daysToDeadline >= 0 && r.daysToDeadline <= Number(deadline);
        })
        .filter((r) => !query.trim() || searchText(r).includes(query.trim().toLowerCase()))
        .sort(byRelevance),
    [db, regionRows, kind, stageId, orgId, lineId, deadline, query],
  );

  const orgOptions: FilterOption[] = [
    { value: ALL, label: "All organisations" },
    ...db.organisations.filter((o) => regionRows.some((r) => r.tender.organisationId === o.id)).map((o) => ({ value: o.id, label: o.shortName })),
  ];
  const lineOptions: FilterOption[] = [
    { value: ALL, label: "All service lines" },
    ...db.serviceLines.filter((l) => l.isActive).map((l) => ({ value: l.id, label: l.name })),
  ];
  const regionSelect: FilterOption[] = [{ value: ALL, label: "All regions" }, ...regionOptions.map((r) => ({ value: r.id, label: r.name }))];

  const urgentCount = regionRows.filter((r) => tenderTone(r) === "danger").length;
  const filtered = !!kind || stageId !== ALL || orgId !== ALL || lineId !== ALL || deadline !== ALL;
  const clear = () => {
    clearKind();
    setStageId(ALL);
    setOrgId(ALL);
    setLineId(ALL);
    setDeadline(ALL);
  };

  return (
    <>
      <PageHeader
        title="Tenders"
        description="Every tender from identification to result, with deadlines, EMD and documents."
        primaryAction={canWrite ? { label: "Add tender", icon: Plus, onClick: () => setAdding(true), testId: "tender-create" } : undefined}
        secondaryActions={[{ label: "Upcoming deadlines", icon: CalendarClock, href: "/tenders/deadlines" }]}
      />
      <AddTenderForm open={adding} onOpenChange={setAdding} />

      {urgentCount > 0 && (
        <Link
          href="/tenders/deadlines"
          className="mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-status-danger/30 bg-status-danger/10 px-3 text-sm font-medium text-status-danger outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8"
        >
          <AlertTriangle className="size-4" aria-hidden="true" />
          {urgentCount} urgent: overdue or due within 2 days
        </Link>
      )}
      <TenderImportExport rows={rows} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Active tenders" value={String(stats.activeCount)} hint={`${formatINR(stats.activeValue, { compact: true })} estimated`} icon={Gavel} />
        <KpiTile
          label="Closing in 7 days"
          value={String(regionRows.filter((r) => r.stage.kind === "OPEN" && r.stage.systemKey !== "SUBMITTED" && r.daysToDeadline >= 0 && r.daysToDeadline <= 7).length)}
          hint="Bids not yet submitted"
          icon={CalendarClock}
          href="/tenders/deadlines"
        />
        <KpiTile label="Win rate" value={stats.winRate === null ? "—" : `${stats.winRate}%`} hint={`${stats.wonCount} won · ${stats.lostCount} lost`} icon={Percent} />
        <KpiTile label="Value won" value={formatINR(stats.wonValue, { compact: true })} hint={`${formatINR(stats.lostValue, { compact: true })} lost`} icon={Wallet} />
      </div>

      <section className="mt-6" aria-label="Upcoming deadlines">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Upcoming deadlines</h2>
          <Button variant="link" size="sm" nativeButton={false} render={<Link href="/tenders/deadlines" />}>
            View all
          </Button>
        </div>
        <DeadlineList withinDays={7} limit={4} />
      </section>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <StageChart rows={regionRows} onSelectStage={(id) => { clearKind(); setStageId(stageId === id ? ALL : id); }} />
        <WonLostChart region={region} />
      </div>

      <section className="mt-6" aria-label="Tender register">
        <h2 className="mb-2 text-sm font-semibold">Tender register</h2>

        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          <StatusChip active={stageId === ALL && !kind} onClick={() => { setStageId(ALL); clearKind(); }} label="All" count={regionRows.length} />
          {stageCounts.map(({ stage, count }) => (
            <StatusChip key={stage.id} active={stageId === stage.id} onClick={() => { clearKind(); setStageId(stageId === stage.id ? ALL : stage.id); }} label={stage.name} count={count} />
          ))}
        </div>

        <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative lg:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tender, number, organisation" aria-label="Search tenders" className="pl-9" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <FilterSelect label="Region" value={region} onChange={setRegion} options={regionSelect} />
            <FilterSelect label="Organisation" value={orgId} onChange={setOrgId} options={orgOptions} />
            <FilterSelect label="Service line" value={lineId} onChange={setLineId} options={lineOptions} className="md:w-52" />
            <FilterSelect label="Deadline" value={deadline} onChange={setDeadline} options={DEADLINE_OPTIONS} />
            {(filtered || query) && (
              <Button
                variant="ghost"
                onClick={() => {
                  clear();
                  setQuery(null);
                }}
                className="col-span-2 sm:col-span-1"
              >
                Clear filters
              </Button>
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border bg-surface">
            <EmptyState message={filtered || query ? "No tenders match these filters." : "No tenders registered yet."} />
          </div>
        ) : (
          <>
            {/* Cards below 1280px: with the sidebar open the table only has room from xl up. */}
            <TenderCards rows={rows} />
            <div className="hidden xl:block">
              <DataTable caption="Tender register" rows={rows} columns={COLUMNS} getRowId={(r) => r.tender.id} getRowHref={(r) => `/tenders/${r.tender.id}`} getRowTone={tenderTone} rowTestId="tender-row" pageSize={40} />
            </div>
          </>
        )}
      </section>
    </>
  );
}

function StatusChip({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8",
        active ? "border-accent-strong bg-accent-subtle font-medium text-accent-strong" : "bg-surface text-muted-foreground hover:bg-accent-subtle",
      )}
    >
      {label}
      <span className="tabular text-xs">{count}</span>
    </button>
  );
}

const searchText = (r: TenderRow) =>
  `${r.tender.title} ${r.tender.tenderNo} ${r.organisationName} ${r.organisationShort} ${r.tender.location} ${r.serviceLineName}`.toLowerCase();

/** Stacked cards for phones and tablets: title, status, and every key field, with a tap-through to the tender. */
function TenderCards({ rows }: { rows: TenderRow[] }) {
  const [visible, setVisible] = useState(20);
  const shown = rows.slice(0, visible);
  return (
    <div className="xl:hidden">
      <ul className="space-y-2" aria-label="Tender register">
        {shown.map((r) => (
          <li key={r.tender.id}>
            <Link href={`/tenders/${r.tender.id}`} className={cn("flex h-full min-h-11 items-center gap-2 rounded-lg border bg-surface p-3 active:bg-accent-subtle md:hover:bg-accent-subtle", toneClass(tenderTone(r)))}>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm font-medium">
                    <span className="break-words">{r.tender.title}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{r.tender.tenderNo}</span>
                  </div>
                  <StageBadge name={r.stage.name} kind={r.stage.kind} color={r.stage.color} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  <CardField label="Organisation">{r.organisationShort}</CardField>
                  <CardField label="Service line">{r.serviceLineName}</CardField>
                  <CardField label="Region">{r.regionName}</CardField>
                  <CardField label="Est. value" numeric>{formatINR(r.tender.estimatedValue, { compact: "auto" })}</CardField>
                  <CardField label="EMD" numeric>{formatINR(r.tender.emdAmount, { compact: "auto" })}</CardField>
                  <CardField label="Opening" numeric>{formatDate(r.tender.openingDate)}</CardField>
                  <CardField label="Submission" numeric>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {formatDate(r.tender.submissionDeadlineAt)}
                      {r.stage.kind === "OPEN" && r.stage.systemKey !== "SUBMITTED" && <DeadlineBadge value={r.tender.submissionDeadlineAt} />}
                    </span>
                  </CardField>
                </dl>
              </div>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      {rows.length > shown.length && (
        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Showing {shown.length} of {rows.length}
          </span>
          <Button variant="outline" size="sm" onClick={() => setVisible((v) => v + 20)}>
            Show more
          </Button>
        </div>
      )}
    </div>
  );
}

function CardField({ label, children, numeric }: { label: string; children: ReactNode; numeric?: boolean }) {
  return (
    <div className={cn("min-w-0", numeric && "tabular")}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}
