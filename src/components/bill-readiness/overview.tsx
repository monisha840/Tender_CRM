"use client";

import { useState } from "react";
import { ListChecks, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatMonth } from "@/lib/dates";
import type { OverviewRow } from "@/modules/bill-readiness/queries";
import { MonthPicker } from "./month-picker";

export function ReadinessBadge({ ready, label }: { ready: boolean; label: string }) {
  return <StatusBadge tone={ready ? "success" : "warning"} label={ready ? "Ready to submit" : label.startsWith("Blocked") ? "Blocked" : label} />;
}

export function BillReadinessOverview({ rows, month, canUpdate }: { rows: OverviewRow[]; month: string; canUpdate: boolean }) {
  const [filter, setFilter] = useState<"ALL" | "READY" | "BLOCKED">("ALL");
  const ready = rows.filter((r) => r.status.ready).length;
  const shown = filter === "ALL" ? rows : rows.filter((r) => (filter === "READY" ? r.status.ready : !r.status.ready));

  const columns: DataTableColumn<OverviewRow>[] = [
    { key: "project", header: "Project", mobile: "title", sortValue: (r) => r.code, cell: (r) => <span className="font-medium">{r.code} · {r.name}</span> },
    { key: "client", header: "Client", cell: (r) => r.clientName },
    { key: "progress", header: "Done", numeric: true, cell: (r) => `${r.status.done}/${r.status.total}` },
    { key: "missing", header: "Missing", cell: (r) => (r.status.ready ? "—" : r.status.missing.join(", ") || r.status.label) },
    { key: "status", header: "Status", mobile: "badge", sortValue: (r) => (r.status.ready ? 1 : 0), cell: (r) => <ReadinessBadge ready={r.status.ready} label={r.status.label} /> },
  ];
  const btn = (key: typeof filter, label: string) => (
    <Button key={key} size="sm" variant={filter === key ? "default" : "outline"} className="min-h-11 md:min-h-8" aria-pressed={filter === key} onClick={() => setFilter(key)} data-testid={`br-filter-${key.toLowerCase()}`}>
      {label}
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Bill readiness"
        description={`What the client needs before releasing payment, ${formatMonth(month)}.`}
        secondaryActions={canUpdate ? [{ label: "Edit checklist items", icon: Settings2, href: "/bill-readiness/template", testId: "br-template-link" }] : undefined}
      />
      <div className="mb-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
        <KpiTile label="Ready to submit" value={String(ready)} hint={`of ${rows.length} projects`} testId="br-kpi-ready" />
        <KpiTile label="Blocked" value={String(rows.length - ready)} hint="Missing mandatory items" testId="br-kpi-blocked" />
      </div>
      {rows.length === 0 ? (
        <div className="rounded-lg border bg-surface">
          <EmptyState icon={ListChecks} message="No active projects yet. Projects appear here once a tender is converted." action={{ label: "Go to projects", href: "/projects" }} />
        </div>
      ) : (
        <DataTable
          caption="Bill readiness by project"
          columns={columns}
          rows={shown}
          getRowId={(r) => r.projectId}
          getRowHref={(r) => `/bill-readiness/${r.projectId}?month=${month}`}
          getRowTestId={(r) => `br-row-${r.code}`}
          search={{ placeholder: "Search projects", getText: (r) => `${r.code} ${r.name} ${r.clientName}` }}
          toolbar={
            <>
              <MonthPicker basePath="/bill-readiness" month={month} />
              {btn("ALL", "All")}
              {btn("BLOCKED", "Blocked")}
              {btn("READY", "Ready")}
            </>
          }
          emptyMessage="No projects match this filter."
        />
      )}
    </>
  );
}
