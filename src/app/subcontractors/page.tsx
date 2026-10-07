"use client";

import { useMemo } from "react";
import { FileClock, HardHat, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { listSubcontractorAssignments, listSubcontractors, type SubcontractorRow } from "@/lib/data";
import { formatINR, moneyToNumber, sumMoney } from "@/lib/money";
import { useDb, useRegionFilter } from "@/store/hooks";

const columns: DataTableColumn<SubcontractorRow>[] = [
  {
    key: "name",
    header: "Subcontractor",
    mobile: "title",
    sortValue: (r) => r.party.name,
    cell: (r) => (
      <div className="min-w-0">
        <p className="font-medium">{r.party.name}</p>
        <p className="text-xs text-muted-foreground">
          {r.party.contactName} · {r.party.phone}
        </p>
      </div>
    ),
  },
  { key: "trade", header: "Trade", cell: (r) => (r.trades.length ? r.trades.join(", ") : r.subcontractor.tradeCategory) },
  { key: "projects", header: "Projects", numeric: true, cell: (r) => r.projects.length },
  { key: "value", header: "Contract value", numeric: true, sortValue: (r) => moneyToNumber(r.contractValue), cell: (r) => formatINR(r.contractValue, { compact: true }) },
  { key: "billed", header: "Billed", numeric: true, cell: (r) => formatINR(r.billed, { compact: true }) },
  { key: "out", header: "Payable", numeric: true, sortValue: (r) => moneyToNumber(r.outstanding), cell: (r) => formatINR(r.outstanding, { compact: true }) },
  { key: "pending", header: "Bills pending", numeric: true, cell: (r) => r.billsAwaitingApproval },
  { key: "st", header: "Status", mobile: "badge", cell: (r) => <StatusBadge status={r.subcontractor.status} /> },
];

export default function Page() {
  const db = useDb();
  const { region } = useRegionFilter();
  const rows = useMemo(() => listSubcontractors(db, region), [db, region]);
  const workPending = useMemo(
    () =>
      listSubcontractorAssignments(db, { region })
        .filter((w) => w.workOrder.status === "ACTIVE")
        .reduce((t, w) => t + moneyToNumber(w.contractValue) * (1 - w.progressPct / 100), 0),
    [db, region],
  );

  return (
    <>
      <PageHeader title="Subcontractors" description="Trade partners, their work orders, bills and payments." />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Payable" value={formatINR(sumMoney(rows.map((r) => r.outstanding)), { compact: true })} icon={Wallet} hint="Approved bills not yet paid" />
        <KpiTile label="Work pending" value={formatINR(workPending, { compact: true })} icon={HardHat} hint="Unexecuted value on active work orders" />
        <KpiTile label="Bills pending" value={String(rows.reduce((t, r) => t + r.billsAwaitingApproval, 0))} icon={FileClock} hint="Awaiting approval" />
      </div>
      <DataTable
        caption="Subcontractors"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.subcontractor.id}
        getRowHref={(r) => `/subcontractors/${r.subcontractor.id}`}
        search={{ placeholder: "Search name, trade, contact", getText: (r) => `${r.party.name} ${r.party.contactName} ${r.trades.join(" ")} ${r.subcontractor.tradeCategory}` }}
        emptyMessage="No subcontractors in this region."
      />
    </>
  );
}
