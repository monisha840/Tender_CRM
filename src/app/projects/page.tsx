"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, FolderKanban, IndianRupee, Plus } from "lucide-react";
import { toast } from "sonner";
import { ImportExport } from "@/components/data/import-export";
import { RecordForm, type FormField } from "@/components/data/record-form";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { FilterPills, ProgressBar } from "@/components/work/parts";
import { listProjects, type ProjectRow } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { formatINR, sumMoney } from "@/lib/money";
import { useUrlParam } from "@/lib/use-url-param";
import { BILLING_CYCLES, buildProject, buildProjects, CONTRACT_TYPES, defaultProjectStatusId, nextProjectCode, PROJECT_CSV_HEADERS } from "@/modules/projects/entry";
import { useDataStore } from "@/store/data-store";
import { useDb, useRegionFilter } from "@/store/hooks";

type Filter = "ALL" | "RUNNING" | "COMPLETED" | "RED";

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
  const db = useDb();
  const upsert = useDataStore((s) => s.upsert);
  const { region, options: regionOptions } = useRegionFilter();
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<Filter>("ALL");
  const all = useMemo(() => listProjects(db, region), [db, region]);
  const byValue = useUrlParam("sort") === "value";
  const rows = useMemo(() => {
    const filtered = all.filter((r) => (filter === "ALL" ? true : filter === "RED" ? isDelayed(r) : filter === "COMPLETED" ? isCompleted(r) : !isCompleted(r)));
    return byValue ? [...filtered].sort((a, b) => Number(b.project.contractValue) - Number(a.project.contractValue)) : filtered;
  }, [all, filter, byValue]);
  const outstanding = sumMoney(all.map((r) => r.billing.outstanding));
  const delayed = all.filter(isDelayed).length;

  const fields = useMemo<FormField[]>(() => {
    const allowed = new Set(regionOptions.map((o) => o.id));
    const sites = db.sites.filter((s) => !s.deletedAt && allowed.has(s.regionId) && (region === "ALL" || s.regionId === region));
    const orgShort = (id: string) => db.organisations.find((o) => o.id === id)?.shortName ?? "";
    const regionCode = (id: string) => db.regions.find((x) => x.id === id)?.code ?? "";
    return [
      { name: "name", label: "Project name", required: true },
      { name: "code", label: "Project code", defaultValue: nextProjectCode(db, region === "ALL" ? undefined : region), hint: "Suggested next code; edit if needed." },
      { name: "customer", label: "Customer organisation", type: "select", options: db.organisations.filter((o) => !o.deletedAt).map((o) => ({ value: o.id, label: o.name })), hint: "Leave blank to use the plant site's customer." },
      {
        name: "site",
        label: "Plant site",
        type: "select",
        required: true,
        options: sites.map((s) => ({ value: s.id, label: `${s.name} (${orgShort(s.organisationId)}, ${regionCode(s.regionId)})` })),
        hint: region === "ALL" ? undefined : "Showing sites in the selected region.",
      },
      { name: "serviceLine", label: "Service line", type: "select", required: true, options: db.serviceLines.filter((l) => l.isActive).map((l) => ({ value: l.id, label: l.name })) },
      { name: "contractType", label: "Contract type", type: "select", required: true, options: CONTRACT_TYPES },
      { name: "billingCycle", label: "Billing cycle", type: "select", required: true, options: BILLING_CYCLES },
      { name: "workOrderNo", label: "Work order no.", hint: "Defaults to WO-<code>." },
      { name: "workOrderDate", label: "Work order date", type: "date" },
      { name: "paymentTermsDays", label: "Payment terms (days)", type: "number", defaultValue: "30" },
      { name: "contractValue", label: "Contract value (INR)", type: "number", required: true },
      { name: "startDate", label: "Start date", type: "date" },
      { name: "plannedEndDate", label: "Planned end date", type: "date" },
      { name: "gstin", label: "GSTIN", type: "select", options: db.gstRegistrations.map((g) => ({ value: g.id, label: g.gstin })), hint: "Blank uses the region's default GSTIN." },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        defaultValue: defaultProjectStatusId(db),
        options: db.projectStatuses.filter((s) => s.isActive).sort((a, b) => a.sequence - b.sequence).map((s) => ({ value: s.id, label: s.name })),
      },
      { name: "projectManager", label: "Project manager", type: "select", options: db.employees.filter((e) => e.userId && !e.deletedAt).map((e) => ({ value: e.id, label: e.name })) },
    ];
  }, [db, region, regionOptions]);

  const save = (values: Record<string, string>) => {
    const r = buildProject(db, values);
    if (r.error !== null) return r.error;
    upsert("projects", r.project);
    toast.success(`Added project ${r.project.code}`);
  };

  const importRecords = (records: Record<string, string>[]) => {
    const { projects, errors } = buildProjects(db, records);
    projects.forEach((p) => upsert("projects", p));
    return { imported: projects.length, errors };
  };

  const exportRows = rows.map((r) => [
    r.project.code,
    r.project.name,
    r.organisationName,
    r.site?.name ?? "",
    r.serviceLineName,
    r.project.contractType,
    r.project.billingCycle,
    r.project.workOrderNo,
    formatDate(r.project.workOrderDate),
    r.project.paymentTermsDays,
    r.project.contractValue,
    formatDate(r.project.startDate),
    formatDate(r.project.plannedEndDate),
    db.gstRegistrations.find((g) => g.id === r.project.gstRegistrationId)?.gstin ?? "",
    r.status.name,
    r.managerName === "—" ? "" : r.managerName,
    r.progressPct.toFixed(1),
    r.health,
  ]);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Work orders from customers, by plant site."
        primaryAction={{ label: "Add project", icon: Plus, onClick: () => setAdding(true) }}
      />
      <RecordForm
        key={db.projects.length}
        open={adding}
        onOpenChange={setAdding}
        title="Add project"
        description="BOQ and daily reports can be added from the project page."
        fields={fields}
        onSubmit={save}
      />
      <ImportExport filename="projects" headers={PROJECT_CSV_HEADERS} rows={exportRows} onImport={importRecords} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Projects" value={String(all.length)} icon={FolderKanban} hint={`${all.filter((r) => !isCompleted(r)).length} running`} />
        <KpiTile label="Contract value" value={formatINR(sumMoney(all.map((r) => r.project.contractValue)), { compact: true })} icon={IndianRupee} />
        <KpiTile label="Outstanding" value={formatINR(outstanding, { compact: true })} icon={Banknote} hint="Billed, not yet received" />
        <KpiTile label="Delayed" value={String(delayed)} icon={AlertTriangle} hint="Behind plan or past end date" />
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
        emptyMessage="No projects match this filter."
      />
    </>
  );
}
