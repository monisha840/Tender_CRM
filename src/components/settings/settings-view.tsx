"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ImportExport } from "@/components/data/import-export";
import { RecordForm, type FormField } from "@/components/data/record-form";
import { newId } from "@/modules/finance/entry";
import { useDataStore } from "@/store/data-store";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { StageBadge, StatusBadge } from "@/components/shared/status-badge";
import type { ExpenseCategory, PermissionScope, Region, Role, ServiceLine, TenderStage } from "@/types";
import { cn } from "@/lib/utils";
import { useDb } from "@/store/hooks";

type Tab = "stages" | "services" | "expenses" | "roles" | "regions";

const SCOPE_LABEL: Record<PermissionScope, string> = { ALL: "All regions", OWN_REGION: "Own region", OWN_PROJECTS: "Own projects", OWN_SITES: "Own sites" };
const KIND_LABEL: Record<TenderStage["kind"], string> = { OPEN: "In progress", WON: "Won", LOST: "Lost", NO_GO: "No-Go", TERMINAL: "Closed" };

/** Read-only settings: tender stages, service lines, roles and regions (they are configuration, not code). */
export function SettingsView() {
  const db = useDb();
  const [tab, setTab] = useState<Tab>("stages");
  const [adding, setAdding] = useState(false);
  const upsert = useDataStore((s) => s.upsert);

  const stages = useMemo(() => [...db.tenderStages].sort((a, b) => a.sequence - b.sequence), [db.tenderStages]);
  const roleRows = useMemo(
    () =>
      db.roles.map((role) => {
        const grants = db.rolePermissions.filter((g) => g.roleId === role.id);
        const modules = new Set(db.permissions.filter((p) => grants.some((g) => g.permissionId === p.id)).map((p) => p.module));
        const scope = grants.length ? grants[0].scope : "OWN_SITES";
        return { role, modules: modules.size, scope, users: db.userRoles.filter((u) => u.roleId === role.id).length };
      }),
    [db],
  );
  const regionRows = useMemo(
    () =>
      db.regions.map((region) => ({
        region,
        state: db.states.find((s) => s.id === region.stateId)?.name ?? "—",
        offices: db.offices.filter((o) => o.regionId === region.id),
        gstins: (db.regionGstRegistrations ?? [])
          .filter((l) => l.regionId === region.id)
          .map((l) => db.gstRegistrations.find((g) => g.id === l.gstRegistrationId))
          .filter((g): g is NonNullable<typeof g> => !!g),
        sites: db.sites.filter((s) => s.regionId === region.id).length,
      })),
    [db],
  );

  const stageCols: DataTableColumn<TenderStage>[] = [
    { key: "n", header: "#", cell: (r) => r.sequence, numeric: true, mobile: "hide" },
    { key: "name", header: "Stage", cell: (r) => <StageBadge name={r.name} kind={r.kind} />, mobile: "title" },
    { key: "kind", header: "Meaning", cell: (r) => KIND_LABEL[r.kind] },
    { key: "a", header: "Status", cell: (r) => <StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} />, mobile: "badge" },
  ];
  const serviceCols: DataTableColumn<ServiceLine>[] = [
    { key: "name", header: "Service line", cell: (r) => r.name, mobile: "title", sortValue: (r) => r.name },
    { key: "u", header: "Default unit", cell: (r) => r.defaultUnit },
    { key: "a", header: "Status", cell: (r) => <StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} />, mobile: "badge" },
  ];
  const roleCols: DataTableColumn<(typeof roleRows)[number]>[] = [
    { key: "name", header: "Role", cell: (r) => <span>{r.role.name}<span className="block text-xs text-muted-foreground">{r.role.description}</span></span>, mobile: "title", sortValue: (r) => r.role.name },
    { key: "scope", header: "Data access", cell: (r) => SCOPE_LABEL[r.scope] },
    { key: "mod", header: "Modules", cell: (r) => r.modules, numeric: true },
    { key: "users", header: "Users", cell: (r) => r.users, numeric: true },
    { key: "layout", header: "Layout", cell: (r) => (r.role.layout === "SITE" ? "Site (mobile-first)" : "Office"), mobile: "badge" },
  ];
  const regionCols: DataTableColumn<(typeof regionRows)[number]>[] = [
    { key: "name", header: "Region", cell: (r) => <span>{r.region.name}<span className="block text-xs text-muted-foreground">{r.region.code} · {r.state}</span></span>, mobile: "title", sortValue: (r) => r.region.name },
    { key: "offices", header: "Offices", cell: (r) => (r.offices.length ? r.offices.map((o) => o.name).join(", ") : "—") },
    { key: "gst", header: "GSTINs", cell: (r) => (r.gstins.length ? r.gstins.map((g) => g.gstin).join(", ") : "—") },
    { key: "sites", header: "Plant sites", cell: (r) => r.sites, numeric: true },
    { key: "a", header: "Status", cell: (r) => <StatusBadge status={r.region.isActive ? "ACTIVE" : "INACTIVE"} />, mobile: "badge" },
  ];

  const expenseCols: DataTableColumn<ExpenseCategory>[] = [
    { key: "name", header: "Expense category", cell: (r) => r.name, mobile: "title", sortValue: (r) => r.name },
    { key: "a", header: "Status", cell: (r) => <StatusBadge status={r.isActive ? "ACTIVE" : "INACTIVE"} />, mobile: "badge" },
  ];

  const nowIso = () => new Date().toISOString();
  const exists = (names: string[], name: string) => names.some((n) => n.trim().toLowerCase() === name.trim().toLowerCase());
  const ADD: Partial<Record<Tab, { label: string; fields: FormField[]; save: (v: Record<string, string>) => string | void }>> = {
    stages: {
      label: "tender stage",
      fields: [
        { name: "name", label: "Stage name", required: true },
        { name: "kind", label: "Meaning", type: "select", required: true, defaultValue: "OPEN", options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })) },
        { name: "sequence", label: "Order", type: "number", required: true, defaultValue: String(Math.max(0, ...stages.map((x) => x.sequence)) + 1), hint: "Position in the pipeline; lower comes first." },
      ],
      save: (v) => {
        if (exists(db.tenderStages.map((x) => x.name), v.name)) return "A stage with this name already exists.";
        const seq = Number(v.sequence);
        if (!Number.isInteger(seq) || seq < 1) return "Order must be a whole number from 1.";
        const now = nowIso();
        upsert("tenderStages", { id: newId("stg_new"), createdAt: now, updatedAt: now, name: v.name, sequence: seq, kind: v.kind as TenderStage["kind"], systemKey: null, isActive: true });
        toast.success(`Stage "${v.name}" added`);
      },
    },
    services: {
      label: "service line",
      fields: [
        { name: "name", label: "Service line", required: true },
        { name: "defaultUnit", label: "Default unit", required: true, placeholder: "man-day, sq m, running metre, MT" },
      ],
      save: (v) => {
        if (exists(db.serviceLines.map((x) => x.name), v.name)) return "A service line with this name already exists.";
        const now = nowIso();
        upsert("serviceLines", { id: newId("svc_new"), createdAt: now, updatedAt: now, name: v.name, defaultUnit: v.defaultUnit, isActive: true });
        toast.success(`Service line "${v.name}" added`);
      },
    },
    expenses: {
      label: "expense category",
      fields: [{ name: "name", label: "Expense category", required: true }],
      save: (v) => {
        if (exists(db.expenseCategories.map((x) => x.name), v.name)) return "This category already exists.";
        const now = nowIso();
        upsert("expenseCategories", { id: newId("exp_new"), createdAt: now, updatedAt: now, name: v.name, isActive: true });
        toast.success(`Category "${v.name}" added`);
      },
    },
  };
  const add = ADD[tab];
  const yn = (b: boolean) => (b ? "Active" : "Inactive");
  const exportSpec: Record<Tab, { headers: string[]; rows: (string | number)[][] }> = {
    stages: { headers: ["Order", "Stage", "Meaning", "Status"], rows: stages.map((r) => [r.sequence, r.name, KIND_LABEL[r.kind], yn(r.isActive)]) },
    services: { headers: ["Service line", "Default unit", "Status"], rows: db.serviceLines.map((r) => [r.name, r.defaultUnit, yn(r.isActive)]) },
    expenses: { headers: ["Expense category", "Status"], rows: db.expenseCategories.map((r) => [r.name, yn(r.isActive)]) },
    roles: { headers: ["Role", "Description", "Data access", "Modules", "Users", "Layout"], rows: roleRows.map((r) => [r.role.name, r.role.description ?? "", SCOPE_LABEL[r.scope], r.modules, r.users, r.role.layout]) },
    regions: { headers: ["Region", "Code", "State", "Offices", "GSTINs", "Plant sites", "Status"], rows: regionRows.map((r) => [r.region.name, r.region.code, r.state, r.offices.map((o) => o.name).join("; "), r.gstins.map((g) => g.gstin).join("; "), r.sites, yn(r.region.isActive)]) },
  };

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "stages", label: "Tender stages", count: stages.length },
    { key: "services", label: "Service lines", count: db.serviceLines.length },
    { key: "expenses", label: "Expense categories", count: db.expenseCategories.length },
    { key: "roles", label: "Roles", count: db.roles.length },
    { key: "regions", label: "Regions", count: db.regions.length },
  ];

  return (
    <>
      <PageHeader title="Settings" description="Configuration that drives the app. Stages, service lines and expense categories can be added here; roles and regions are view and export only."
        primaryAction={add ? { label: `Add ${add.label}`, icon: Plus, onClick: () => setAdding(true) } : undefined}
      />
      {adding && add && <RecordForm key={tab} open onOpenChange={setAdding} title={`Add ${add.label}`} fields={add.fields} onSubmit={add.save} />}
      <ImportExport filename={`settings-${tab}`} headers={exportSpec[tab].headers} rows={exportSpec[tab].rows} />
      <div role="tablist" aria-label="Settings lists" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn("-mb-px flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium md:min-h-9", tab === t.key ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
            <span className="tabular rounded-md bg-muted px-1.5 text-xs">{t.count}</span>
          </button>
        ))}
      </div>
      {tab === "stages" && <DataTable caption="Tender stages" columns={stageCols} rows={stages} getRowId={(r) => r.id} pageSize={50} />}
      {tab === "services" && <DataTable caption="Service lines" columns={serviceCols} rows={db.serviceLines} getRowId={(r) => r.id} pageSize={50} search={{ placeholder: "Search service lines", getText: (r) => r.name }} />}
      {tab === "expenses" && <DataTable caption="Expense categories" columns={expenseCols} rows={db.expenseCategories} getRowId={(r) => r.id} pageSize={50} search={{ placeholder: "Search categories", getText: (r) => r.name }} />}
      {tab === "roles" && <DataTable caption="Roles" columns={roleCols} rows={roleRows} getRowId={(r) => (r.role as Role).id} pageSize={50} />}
      {tab === "regions" && <DataTable caption="Regions" columns={regionCols} rows={regionRows} getRowId={(r) => (r.region as Region).id} pageSize={50} />}
    </>
  );
}
