"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileClock, HardHat, Plus, UserPlus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { ImportExport } from "@/components/data/import-export";
import { RecordForm, type FormField } from "@/components/data/record-form";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { listSubcontractorAssignments, listSubcontractors, type SubcontractorRow } from "@/lib/data";
import { addDays, daysBetween, getToday } from "@/lib/dates";
import { formatINR, moneyToNumber, sumMoney } from "@/lib/money";
import { useUrlState } from "@/lib/use-url-param";
import { buildAssignment, buildSubcontractor, buildSubcontractors, SUBCONTRACTOR_CSV_HEADERS, SUBCONTRACTOR_STATUSES } from "@/modules/subcontractors/entry";
import { useDataStore } from "@/store/data-store";
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
  { key: "billed", header: "Billed", numeric: true, cell: (r) => formatINR(r.billed, { compact: true }) },
  { key: "out", header: "Payable", numeric: true, sortValue: (r) => moneyToNumber(r.outstanding), cell: (r) => formatINR(r.outstanding, { compact: true }) },
  { key: "pending", header: "Bills pending", numeric: true, cell: (r) => r.billsAwaitingApproval },
  { key: "st", header: "Status", mobile: "badge", cell: (r) => <StatusBadge status={r.subcontractor.status} /> },
];

export default function Page() {
  const db = useAsOfDb();
  const upsert = useDataStore((s) => s.upsert);
  const { region } = useRegionFilter();
  const [adding, setAdding] = useState(false);
  const [assigning, setAssigning] = useState(false);
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

  const stateOptions = db.states.map((s) => ({ value: s.id, label: s.name }));
  const addFields: FormField[] = [
    { name: "name", label: "Name", required: true },
    { name: "contactName", label: "Contact person", required: true },
    { name: "phone", label: "Phone", type: "tel", required: true },
    { name: "email", label: "Email", type: "email" },
    { name: "gstin", label: "GSTIN", hint: "Optional. 15 characters." },
    { name: "pan", label: "PAN", required: true, placeholder: "ABCDE1234F" },
    { name: "address", label: "Address", type: "textarea" },
    { name: "state", label: "State", type: "select", required: true, options: stateOptions },
    { name: "tradeCategory", label: "Trade category", required: true, placeholder: "Civil, Painting, Stone Picking" },
    { name: "isLabourSupplier", label: "Labour supplier", type: "select", required: true, defaultValue: "No", options: [{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }] },
    { name: "status", label: "Status", type: "select", required: true, defaultValue: "ACTIVE", options: SUBCONTRACTOR_STATUSES },
  ];
  const assignFields = useMemo<FormField[]>(
    () => [
      {
        name: "subcontractor",
        label: "Subcontractor",
        type: "select",
        required: true,
        options: db.subcontractors
          .filter((s) => !s.deletedAt && s.status !== "BLACKLISTED")
          .map((s) => ({ value: s.id, label: db.parties.find((p) => p.id === s.partyId)?.name ?? s.id }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      {
        name: "project",
        label: "Project",
        type: "select",
        required: true,
        options: db.projects.filter((p) => !p.deletedAt && (region === "ALL" || p.regionId === region)).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })),
      },
      { name: "trade", label: "Trade", required: true, placeholder: "Civil, Painting, Stone Picking" },
      { name: "scope", label: "Scope of work", type: "textarea" },
      { name: "contractValue", label: "Contract value (INR)", type: "number", required: true },
      { name: "startDate", label: "Start date", type: "date" },
      { name: "endDate", label: "End date", type: "date" },
      { name: "retentionPercent", label: "Retention (%)", type: "number", defaultValue: "5" },
    ],
    [db, region],
  );

  const save = (values: Record<string, string>) => {
    const r = buildSubcontractor(db, values);
    if (r.error !== null) return r.error;
    upsert("parties", r.party);
    upsert("subcontractors", r.subcontractor);
    toast.success(`Added ${r.party.name}`);
  };
  const assign = (values: Record<string, string>) => {
    const r = buildAssignment(db, values);
    if (r.error !== null) return r.error;
    upsert("workOrders", r.workOrder);
    toast.success(`Assigned. Work order ${r.workOrder.workOrderNo}`);
  };
  const importRecords = (records: Record<string, string>[]) => {
    const { parties, subcontractors, errors } = buildSubcontractors(db, records);
    parties.forEach((p) => upsert("parties", p));
    subcontractors.forEach((s) => upsert("subcontractors", s));
    return { imported: subcontractors.length, errors };
  };

  const exportRows = rows.map((r) => [
    r.party.name,
    r.subcontractor.tradeCategory,
    r.party.contactName,
    r.party.phone,
    r.party.email ?? "",
    r.party.gstin ?? "",
    r.party.pan,
    r.party.address,
    db.states.find((s) => s.id === r.party.stateId)?.name ?? "",
    r.subcontractor.isLabourSupplier ? "Yes" : "No",
    r.subcontractor.status,
    r.projects.map((p) => p.code).join("; "),
    r.contractValue,
    r.billed,
    r.outstanding,
  ]);

  return (
    <>
      <PageHeader
        title="Subcontractors"
        description="Trade partners, their work orders, bills and payments."
        primaryAction={{ label: "Add subcontractor", icon: Plus, onClick: () => setAdding(true) }}
        secondaryActions={[{ label: "Assign to project", icon: UserPlus, onClick: () => setAssigning(true) }]}
      />
      <RecordForm key={`add-${db.subcontractors.length}`} open={adding} onOpenChange={setAdding} title="Add subcontractor" fields={addFields} onSubmit={save} />
      <RecordForm
        key={`assign-${db.workOrders.length}-${db.subcontractors.length}`}
        open={assigning}
        onOpenChange={setAssigning}
        title="Assign to project"
        description="Creates a work order for the subcontractor on the project."
        submitLabel="Assign"
        fields={assignFields}
        onSubmit={assign}
      />
      <ImportExport filename="subcontractors" headers={SUBCONTRACTOR_CSV_HEADERS} rows={exportRows} onImport={importRecords} />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiTile label="Payable" value={formatINR(sumMoney(rows.map((r) => r.outstanding)), { compact: true })} icon={Wallet} hint="Approved bills not yet paid" />
        <KpiTile label="Work pending" value={formatINR(workPending, { compact: true })} icon={HardHat} hint="Unexecuted value on active work orders" />
        <KpiTile label="Bills pending" value={String(rows.reduce((t, r) => t + r.billsAwaitingApproval, 0))} icon={FileClock} hint="Awaiting approval" />
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
        getRowTone={rowTone}
        search={{ placeholder: "Search name, trade, contact", getText: (r) => `${r.party.name} ${r.party.contactName} ${r.trades.join(" ")} ${r.subcontractor.tradeCategory}` }}
        emptyMessage={pendingOnly ? "No subcontractor payments are pending." : "No subcontractors in this region."}
      />
    </>
  );
}
