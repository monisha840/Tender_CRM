"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, FolderKanban, IndianRupee } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterPills, ProgressBar } from "@/components/work/parts";
import { listProjects, type ProjectRow } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { formatINR, sumMoney } from "@/lib/money";
import { useDb, useRegionFilter } from "@/store/hooks";

type Filter = "ALL" | "RUNNING" | "COMPLETED" | "RED";

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
  const db = useDb();
  const { region } = useRegionFilter();
  const [filter, setFilter] = useState<Filter>("ALL");
  const all = useMemo(() => listProjects(db, region), [db, region]);
  const rows = useMemo(
    () =>
      all.filter((r) =>
        filter === "ALL" ? true : filter === "RED" ? r.health === "RED" : filter === "COMPLETED" ? r.status.systemKey === "COMPLETED" : r.status.systemKey !== "COMPLETED",
      ),
    [all, filter],
  );
  const outstanding = sumMoney(all.map((r) => r.billing.outstanding));

  return (
    <>
      <PageHeader title="Projects" description="Work orders from customers, by plant site." />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Projects" value={String(all.length)} icon={FolderKanban} hint={`${all.filter((r) => r.status.systemKey !== "COMPLETED").length} running`} />
        <KpiTile label="Contract value" value={formatINR(sumMoney(all.map((r) => r.project.contractValue)), { compact: true })} icon={IndianRupee} />
        <KpiTile label="Outstanding" value={formatINR(outstanding, { compact: true })} icon={Banknote} hint="Billed, not yet received" />
        <KpiTile label="Delayed" value={String(all.filter((r) => r.health === "RED").length)} icon={AlertTriangle} hint="Behind plan by 15%+" />
      </div>
      <DataTable
        caption="Projects"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.project.id}
        getRowHref={(r) => `/projects/${r.project.id}`}
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
        emptyMessage="No projects match this filter."
      />
    </>
  );
}
