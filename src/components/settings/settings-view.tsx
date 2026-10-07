"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { StageBadge, StatusBadge } from "@/components/shared/status-badge";
import type { PermissionScope, Region, Role, ServiceLine, TenderStage } from "@/types";
import { cn } from "@/lib/utils";
import { useDb } from "@/store/hooks";

type Tab = "stages" | "services" | "roles" | "regions";

const SCOPE_LABEL: Record<PermissionScope, string> = { ALL: "All regions", OWN_REGION: "Own region", OWN_PROJECTS: "Own projects", OWN_SITES: "Own sites" };
const KIND_LABEL: Record<TenderStage["kind"], string> = { OPEN: "In progress", WON: "Won", LOST: "Lost", NO_GO: "No-Go", TERMINAL: "Closed" };

/** Read-only settings: tender stages, service lines, roles and regions (they are configuration, not code). */
export function SettingsView() {
  const db = useDb();
  const [tab, setTab] = useState<Tab>("stages");

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

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "stages", label: "Tender stages", count: stages.length },
    { key: "services", label: "Service lines", count: db.serviceLines.length },
    { key: "roles", label: "Roles", count: db.roles.length },
    { key: "regions", label: "Regions", count: db.regions.length },
  ];

  return (
    <>
      <PageHeader title="Settings" description="Read-only view of the configuration that drives the app. Editing arrives with the backend." />
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
      {tab === "roles" && <DataTable caption="Roles" columns={roleCols} rows={roleRows} getRowId={(r) => (r.role as Role).id} pageSize={50} />}
      {tab === "regions" && <DataTable caption="Regions" columns={regionCols} rows={regionRows} getRowId={(r) => (r.region as Region).id} pageSize={50} />}
    </>
  );
}
