"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileClock, HardHat, Plus, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { useTenderRoles } from "@/components/tenders/action-helpers";
import { AddSubcontractorForm } from "@/components/work/subcontractor-entry";
import { listSubcontractorAssignments, listSubcontractors, type SubcontractorRow } from "@/lib/data";
import { addDays, daysBetween, getToday } from "@/lib/dates";
import { formatINR, moneyToNumber, sumMoney } from "@/lib/money";
import { useUrlState } from "@/lib/use-url-param";
import { useRegionFilter } from "@/store/hooks";
import { useAsOfDb } from "@/components/layout/use-as-of-db";

/** Subcontractor bills fall due this many days after the bill date. */
const PAYMENT_DAYS = 30;

type Row = SubcontractorRow & { overdueDays: number };

const rowTone = (r: Row) => (r.overdueDays > 0 ? "danger" : r.billsAwaitingApproval > 0 ? "warning" : undefined);

const columns: DataTableColumn<Row>[] = [
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
        {r.overdueDays > 0 ? (
          <StatusBadge tone="danger" label={`Payment overdue by ${r.overdueDays} day${r.overdueDays === 1 ? "" : "s"}`} className="mt-1" />
        ) : r.billsAwaitingApproval > 0 ? (
          <StatusBadge tone="warning" label={`${r.billsAwaitingApproval} bill${r.billsAwaitingApproval === 1 ? "" : "s"} awaiting approval`} className="mt-1" />
        ) : null}
      </div>
    ),
  },
  { key: "trade", header: "Trade", cell: (r) => (r.trades.length ? r.trades.join(", ") : r.subcontractor.tradeCategory) },
  { key: "projects", header: "Projects", numeric: true, cell: (r) => r.projects.length },
  { key: "value", header: "Contract value", numeric: true, sortValue: (r) => moneyToNumber(r.contractValue), cell: (r) => formatINR(r.contractValue, { compact: true }) },
  { key: "billed", header: "Billed (excl. GST)", numeric: true, cell: (r) => formatINR(r.billed, { compact: true }) },
  { key: "out", header: "Payable", numeric: true, sortValue: (r) => moneyToNumber(r.outstanding), cell: (r) => formatINR(r.outstanding, { compact: true }) },
  { key: "pending", header: "Bills pending", numeric: true, cell: (r) => r.billsAwaitingApproval },
  { key: "st", header: "Status", mobile: "badge", cell: (r) => <StatusBadge status={r.subcontractor.status} /> },
];

export default function Page() {
  const db = useAsOfDb();
  const { canWrite } = useTenderRoles();
  const [adding, setAdding] = useState(false);
  const { region } = useRegionFilter();
  const base = useMemo(() => listSubcontractors(db, region), [db, region]);
  const all = useMemo<Row[]>(() => {
    const today = getToday();
    return base.map((r) => {
      const overdue = db.subcontractorBills
        .filter((b) => b.subcontractorId === r.subcontractor.id && (b.status === "APPROVED" || b.status === "PARTLY_PAID") && moneyToNumber(b.netPayable) > moneyToNumber(b.paidAmount))
        .map((b) => daysBetween(addDays(b.billDate, PAYMENT_DAYS), today));
      return { ...r, overdueDays: Math.max(0, ...overdue) };
    });
  }, [base, db.subcontractorBills]);
  // Both filters live in the URL: ?payment=pending (dashboard link) and ?overdue=1.
  const [paymentParam, setPaymentParam] = useUrlState("payment");
  const pendingOnly = paymentParam === "pending";
  const [overdueParam, setOverdueParam] = useUrlState("overdue");
  const overdueOnly = overdueParam === "1";
  const rows = useMemo(
    () =>
      all.filter((r) => (pendingOnly ? moneyToNumber(r.outstanding) > 0 || r.billsAwaitingApproval > 0 : true)).filter((r) => (overdueOnly ? r.overdueDays > 0 : true)),
    [all, pendingOnly, overdueOnly],
  );
  const overdueCount = all.filter((r) => r.overdueDays > 0).length;
  const workPending = useMemo(
    () =>
      listSubcontractorAssignments(db, { region })
        .filter((w) => w.workOrder.status === "ACTIVE")
        .reduce((t, w) => t + moneyToNumber(w.contractValue) * (1 - w.progressPct / 100), 0),
    [db, region],
  );

  return (
    <>
      <PageHeader
        title="Subcontractors"
        description="Trade partners, their work orders, bills and payments."
        primaryAction={canWrite ? { label: "Add subcontractor", icon: Plus, onClick: () => setAdding(true), testId: "subcontractor-create" } : undefined}
      />
      {adding && <AddSubcontractorForm open onOpenChange={setAdding} />}
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile testId="kpi-sub-payable" label="Payable" value={formatINR(sumMoney(rows.map((r) => r.outstanding)), { compact: true })} icon={Wallet} hint="Approved bills not yet paid" />
        <KpiTile testId="kpi-sub-work-pending" label="Work pending" value={formatINR(workPending, { compact: true })} icon={HardHat} hint="Unexecuted value on active work orders" />
        <KpiTile testId="kpi-sub-bills-pending" label="Bills pending" value={String(rows.reduce((t, r) => t + r.billsAwaitingApproval, 0))} icon={FileClock} hint="Awaiting approval" />
      </div>
      {overdueCount > 0 && (
        <button
          type="button"
          onClick={() => setOverdueParam(overdueOnly ? null : "1")}
          aria-pressed={overdueOnly}
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-status-danger-tint px-3 text-sm font-medium text-status-danger outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AlertTriangle className="size-4" aria-hidden="true" />
          {overdueOnly ? `Showing ${overdueCount} with overdue payments. Show all` : `${overdueCount} with overdue payments. Show them`}
        </button>
      )}
      {pendingOnly && (
        <button
          type="button"
          onClick={() => setPaymentParam(null)}
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-accent-strong bg-accent-subtle px-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Showing subcontractors with pending payments. Show all
        </button>
      )}
      <DataTable
        caption="Subcontractors"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.subcontractor.id}
        getRowHref={(r) => `/subcontractors/${r.subcontractor.id}`}
        getRowTestId={(r) => `subcontractor-row-${r.party.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`}
        getRowTone={rowTone}
        search={{ placeholder: "Search name, trade, contact", getText: (r) => `${r.party.name} ${r.party.contactName} ${r.trades.join(" ")} ${r.subcontractor.tradeCategory}` }}
        emptyMessage={pendingOnly ? "No subcontractor payments are pending." : "No subcontractors yet."}
      />
    </>
  );
}
