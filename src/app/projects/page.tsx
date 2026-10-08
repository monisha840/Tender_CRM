"use client";

import { useMemo } from "react";
import { AlertTriangle, Banknote, FolderKanban, IndianRupee } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterPills, ProgressBar } from "@/components/work/parts";
import { matchesProjectFilter, parseProjectFilter, type ProjectFilter } from "@/components/work/project-filter";
import { listProjects, type ProjectRow } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { PHASE67_ENABLED } from "@/lib/features";
import { formatINR, sumMoney } from "@/lib/money";
import { useUrlParam, useUrlState } from "@/lib/use-url-param";
import { useRegionFilter } from "@/store/hooks";
import { useAsOfDb } from "@/components/layout/use-as-of-db";

type Filter = ProjectFilter;

const isCompleted = (r: ProjectRow) => r.status.systemKey === "COMPLETED";
const isOverdue = (r: ProjectRow) => !isCompleted(r) && r.daysToEnd < 0;
/** Delayed = behind plan (red health) or past the planned end date and not completed. */
const isDelayed = (r: ProjectRow) => !isCompleted(r) && (r.health === "RED" || isOverdue(r));
const rowTone = (r: ProjectRow) => (isDelayed(r) ? "danger" : !isCompleted(r) && r.health === "AMBER" ? "warning" : undefined);

const columns: DataTableColumn<ProjectRow>[] = [
  {
    key: "name",
    header: "Project",
    mobile: "title",
    sortValue: (r) => r.project.name,
    cell: (r) => (
      <div className="min-w-0">
        <p className="font-medium">{r.project.name}</p>
        <p className="text-xs text-muted-foreground">
          {r.project.code} · {r.site?.name ?? r.organisationName}
        </p>
        {isOverdue(r) ? (
          <StatusBadge tone="danger" label={`Overdue by ${-r.daysToEnd} day${r.daysToEnd === -1 ? "" : "s"}`} className="mt-1" />
        ) : isDelayed(r) ? (
          <StatusBadge tone="danger" label="Delayed" className="mt-1" />
        ) : null}
      </div>
    ),
  },
  { key: "service", header: "Service line", cell: (r) => r.serviceLineName },
  { key: "value", header: "Value", numeric: true, sortValue: (r) => Number(r.project.contractValue), cell: (r) => formatINR(r.project.contractValue, { compact: true }) },
  {
    key: "progress",
    header: "Progress",
    className: "min-w-44",
    sortValue: (r) => r.progressPct,
    cell: (r) => <ProgressBar value={r.progressPct} marker={r.plannedPct} />,
  },
  { key: "end", header: "Ends", sortValue: (r) => r.project.plannedEndDate ?? "", cell: (r) => formatDate(r.project.plannedEndDate) },
  { key: "status", header: "Status", mobile: "badge", cell: (r) => <StatusBadge tone={r.status.systemKey === "COMPLETED" ? "success" : "accent"} label={r.status.name} /> },
  { key: "health", header: "Health", cell: (r) => <StatusBadge status={r.health} /> },
];

export default function Page() {
  const db = useAsOfDb();
  const { region } = useRegionFilter();
  // The status pill lives in the URL (?status=RED) so it survives navigation and can be linked to.
  const [filterParam, setFilterParam] = useUrlState("status", "ALL");
  const filter: Filter = parseProjectFilter(filterParam);
  const setFilter = (f: Filter) => setFilterParam(f);
  const all = useMemo(() => listProjects(db, region), [db, region]);
  const byValue = useUrlParam("sort") === "value";
  const rows = useMemo(() => {
    const filtered = all.filter((r) => matchesProjectFilter(filter, r));
    return byValue ? [...filtered].sort((a, b) => Number(b.project.contractValue) - Number(a.project.contractValue)) : filtered;
  }, [all, filter, byValue]);
  const outstanding = sumMoney(all.map((r) => r.billing.outstanding));
  const delayed = all.filter(isDelayed).length;

  return (
    <>
      <PageHeader
        title="Projects"
        description="Work orders from customers, by plant site."
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile testId="kpi-projects-total" label="Projects" value={String(all.length)} icon={FolderKanban} hint={`${all.filter((r) => !isCompleted(r)).length} running`} />
        <KpiTile label="Contract value" value={formatINR(sumMoney(all.map((r) => r.project.contractValue)), { compact: true })} icon={IndianRupee} />
        {PHASE67_ENABLED && <KpiTile label="Outstanding" value={formatINR(outstanding, { compact: true })} icon={Banknote} hint="Invoiced incl. GST, not yet received" />}
        <KpiTile testId="kpi-projects-delayed" label="Delayed" value={String(delayed)} icon={AlertTriangle} hint="Behind plan or past end date" />
      </div>
      {delayed > 0 && filter !== "RED" && (
        <button
          type="button"
          onClick={() => setFilter("RED")}
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-status-danger-tint px-3 text-sm font-medium text-status-danger outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AlertTriangle className="size-4" aria-hidden="true" />
          {delayed} delayed. Show them
        </button>
      )}
      <DataTable
        caption="Projects"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.project.id}
        getRowHref={(r) => `/projects/${r.project.id}`}
        getRowTestId={(r) => `project-row-${r.project.code}`}
        getRowTone={rowTone}
        search={{ placeholder: "Search projects, sites, work orders", getText: (r) => `${r.project.name} ${r.project.code} ${r.project.workOrderNo} ${r.site?.name ?? ""} ${r.organisationName}` }}
        toolbar={
          <FilterPills
            value={filter}
            onChange={setFilter}
            options={[
              { key: "ALL", label: "All" },
              { key: "RUNNING", label: "Running" },
              { key: "COMPLETED", label: "Completed" },
              { key: "RED", label: "Delayed" },
            ]}
          />
        }
        emptyMessage={all.length === 0 ? "No projects yet. A won tender is converted into a project from the tender page." : "No projects match this filter."}
      />
    </>
  );
}
