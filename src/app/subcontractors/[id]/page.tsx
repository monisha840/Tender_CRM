"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { FieldGrid, ProgressBar, Section } from "@/components/work/parts";
import { listSubcontractorAssignments, listSubcontractors, type AssignmentRow } from "@/lib/data";
import { formatDate } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { useDb } from "@/store/hooks";
import type { Payment, SubcontractorBill } from "@/types";

const money = (v: string) => formatINR(v);

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const db = useDb();
  const row = useMemo(() => listSubcontractors(db).find((r) => r.subcontractor.id === id), [db, id]);
  if (!row) {
    return (
      <div className="rounded-lg border bg-surface">
        <EmptyState message="This subcontractor does not exist." action={{ label: "Back to subcontractors", href: "/subcontractors" }} />
      </div>
    );
  }
  const { party, subcontractor } = row;
  const state = db.states.find((s) => s.id === party.stateId);
  const assignments = listSubcontractorAssignments(db, { subcontractorId: id });
  const bills = db.subcontractorBills.filter((b) => b.subcontractorId === id && !b.deletedAt).sort((a, b) => b.billDate.localeCompare(a.billDate));
  const billIds = new Set(bills.map((b) => b.id));
  const payments = db.payments.filter((p) => p.subcontractorBillId && billIds.has(p.subcontractorBillId)).sort((a, b) => b.paidOn.localeCompare(a.paidOn));
  const linkedDocIds = new Set(db.documentLinks.filter((l) => l.entityType === "SUBCONTRACTOR" && l.entityId === id).map((l) => l.documentId));
  const docs = db.documents.filter((d) => linkedDocIds.has(d.id));
  const projectName = (pid: string) => db.projects.find((p) => p.id === pid)?.name ?? "—";
  const billNo = (bid?: string | null) => bills.find((b) => b.id === bid)?.billNo ?? "—";

  const assignCols: DataTableColumn<AssignmentRow>[] = [
    {
      key: "p",
      header: "Project",
      mobile: "title",
      cell: (r) => (
        <Link href={`/projects/${r.workOrder.projectId}`} className="font-medium text-accent-strong hover:underline">
          {r.projectName}
        </Link>
      ),
    },
    { key: "t", header: "Trade", cell: (r) => r.trade },
    { key: "wo", header: "Work order", cell: (r) => <span className="text-muted-foreground">{r.workOrder.workOrderNo}</span> },
    { key: "v", header: "Value", numeric: true, cell: (r) => formatINR(r.contractValue, { compact: true }) },
    { key: "pr", header: "Progress", className: "min-w-36", cell: (r) => <ProgressBar value={r.progressPct} /> },
    { key: "bal", header: "Balance", numeric: true, cell: (r) => formatINR(r.balance, { compact: true }) },
    { key: "s", header: "Status", mobile: "badge", cell: (r) => <StatusBadge status={r.workOrder.status} /> },
  ];
  const billCols: DataTableColumn<SubcontractorBill>[] = [
    { key: "n", header: "Bill", mobile: "title", cell: (b) => <span className="font-medium">{b.billNo}</span> },
    { key: "d", header: "Date", cell: (b) => formatDate(b.billDate) },
    { key: "p", header: "Project", cell: (b) => projectName(b.projectId) },
    { key: "g", header: "Gross", numeric: true, cell: (b) => money(b.grossAmount) },
    { key: "ded", header: "Deductions", numeric: true, cell: (b) => money(b.totalDeductions) },
    { key: "net", header: "Net payable", numeric: true, cell: (b) => money(b.netPayable) },
    { key: "paid", header: "Paid", numeric: true, cell: (b) => money(b.paidAmount) },
    { key: "s", header: "Status", mobile: "badge", cell: (b) => <StatusBadge status={b.status} /> },
  ];
  const payCols: DataTableColumn<Payment>[] = [
    { key: "d", header: "Paid on", mobile: "title", cell: (p) => <span className="font-medium">{formatDate(p.paidOn)}</span> },
    { key: "b", header: "Bill", cell: (p) => billNo(p.subcontractorBillId) },
    { key: "m", header: "Mode", cell: (p) => p.mode.replace(/_/g, " ").toLowerCase() },
    { key: "u", header: "Reference", cell: (p) => <span className="text-muted-foreground">{p.utr ?? "—"}</span> },
    { key: "a", header: "Amount", numeric: true, cell: (p) => money(p.amount) },
  ];

  return (
    <>
      <PageHeader
        title={party.name}
        status={<StatusBadge status={subcontractor.status} />}
        description={`${subcontractor.tradeCategory} · ${row.projects.length} project${row.projects.length === 1 ? "" : "s"}`}
        secondaryActions={[{ label: "All subcontractors", href: "/subcontractors" }]}
      />
      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiTile label="Contract value" value={formatINR(row.contractValue, { compact: true })} />
          <KpiTile label="Billed" value={formatINR(row.billed, { compact: true })} />
          <KpiTile label="Payable" value={formatINR(row.outstanding, { compact: true })} />
          <KpiTile label="Bills pending" value={String(row.billsAwaitingApproval)} hint="Awaiting approval" />
        </div>
        <Section title="Details">
          <div className="rounded-lg border bg-surface p-4">
            <FieldGrid
              fields={[
                { label: "Contact person", value: party.contactName },
                { label: "Phone", value: party.phone },
                { label: "Email", value: party.email },
                { label: "Trade", value: subcontractor.tradeCategory },
                { label: "Type", value: subcontractor.isLabourSupplier ? "Labour supplier" : "Works contractor" },
                { label: "Status", value: <StatusBadge status={subcontractor.status} /> },
                { label: "GSTIN", value: party.gstin },
                { label: "PAN", value: party.pan },
                { label: "State", value: state?.name },
                { label: "Address", value: party.address },
              ]}
            />
          </div>
        </Section>
        <Section title="Assigned projects">
          <DataTable caption="Assigned projects" rows={assignments} getRowId={(r) => r.workOrder.id} columns={assignCols} emptyMessage="Not assigned to any project yet." />
        </Section>
        <Section title="Bills">
          <DataTable caption="Subcontractor bills" rows={bills} getRowId={(b) => b.id} columns={billCols} pageSize={10} emptyMessage="No bills raised yet." />
        </Section>
        <Section title="Payment history">
          <DataTable caption="Payments" rows={payments} getRowId={(p) => p.id} columns={payCols} pageSize={10} emptyMessage="No payments made yet." />
        </Section>
        <Section title="Documents">
          {docs.length === 0 ? (
            <div className="rounded-lg border bg-surface">
              <EmptyState message="No documents uploaded." />
            </div>
          ) : (
            <ul className="divide-y rounded-lg border bg-surface">
              {docs.map((d) => (
                <li key={d.id} className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm">
                  <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{d.fileName}</span>
                  <span className="tabular text-xs text-muted-foreground">{Math.round(d.size / 1024)} KB</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
