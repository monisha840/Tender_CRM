"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard, LegendItem } from "@/components/charts/chart-card";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiTile } from "@/components/shared/kpi-tile";
import { StatusBadge } from "@/components/shared/status-badge";
import { FieldGrid, ProgressBar, Section, Tabs } from "@/components/work/parts";
import { getDailyReports, getProject, getProjectBilling, listInvoices, listSubcontractorAssignments, type AssignmentRow, type InvoiceRow } from "@/lib/data";
import { formatDate, formatMonth } from "@/lib/dates";
import { formatINR, formatINRAxis, moneyToNumber } from "@/lib/money";
import { useDb } from "@/store/hooks";
import type { DailyWorkReport } from "@/types";

type Tab = "overview" | "progress" | "subs" | "billing" | "reports";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "progress", label: "Progress" },
  { key: "subs", label: "Subcontractors" },
  { key: "billing", label: "Billing & Payment" },
  { key: "reports", label: "Daily reports" },
];

const axis = { fontSize: 11, fill: "var(--text-secondary)" };

const subCols: DataTableColumn<AssignmentRow>[] = [
  { key: "trade", header: "Trade", mobile: "title", sortValue: (r) => r.trade, cell: (r) => <span className="font-medium">{r.trade}</span> },
  {
    key: "sub",
    header: "Subcontractor",
    cell: (r) => (
      <Link href={`/subcontractors/${r.workOrder.subcontractorId}`} className="text-accent-strong underline-offset-2 hover:underline">
        {r.subcontractorName}
      </Link>
    ),
  },
  { key: "scope", header: "Scope", mobile: "hide", cell: (r) => <span className="text-muted-foreground">{r.workOrder.scope}</span> },
  { key: "value", header: "Value", numeric: true, cell: (r) => formatINR(r.contractValue, { compact: true }) },
  { key: "progress", header: "Progress", className: "min-w-36", cell: (r) => <ProgressBar value={r.progressPct} /> },
  { key: "billed", header: "Billed", numeric: true, cell: (r) => formatINR(r.billed, { compact: true }) },
  { key: "paid", header: "Paid", numeric: true, cell: (r) => formatINR(r.paid, { compact: true }) },
  { key: "bal", header: "Balance", numeric: true, cell: (r) => formatINR(r.balance, { compact: true }) },
  { key: "status", header: "Status", mobile: "badge", cell: (r) => <StatusBadge status={r.workOrder.status} /> },
];

const invCols: DataTableColumn<InvoiceRow>[] = [
  { key: "no", header: "Invoice", mobile: "title", cell: (r) => <span className="font-medium">{r.invoice.invoiceNo}</span> },
  { key: "date", header: "Date", cell: (r) => formatDate(r.invoice.invoiceDate) },
  { key: "total", header: "Total", numeric: true, cell: (r) => formatINR(r.invoice.total) },
  { key: "recv", header: "Received", numeric: true, cell: (r) => formatINR(r.invoice.receivedAmount) },
  { key: "out", header: "Outstanding", numeric: true, cell: (r) => formatINR(r.outstanding) },
  { key: "due", header: "Due", cell: (r) => formatDate(r.invoice.dueDate) },
  { key: "st", header: "Payment", mobile: "badge", cell: (r) => <StatusBadge status={r.invoice.paymentStatus} /> },
];

const reportCols: DataTableColumn<DailyWorkReport>[] = [
  { key: "date", header: "Date", mobile: "title", cell: (r) => <span className="font-medium">{formatDate(r.reportDate)}</span> },
  { key: "workers", header: "Workers", numeric: true, cell: (r) => r.workersCount },
  { key: "issues", header: "Issues", cell: (r) => <span className="text-muted-foreground">{r.issues ?? "None"}</span> },
  { key: "photos", header: "Photos", numeric: true, cell: (r) => r.photoCount },
  { key: "st", header: "Status", mobile: "badge", cell: (r) => <StatusBadge status={r.status} /> },
];

function label(s: string) {
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function Detail({ id }: { id: string }) {
  const db = useDb();
  const [tab, setTab] = useState<Tab>("overview");
  const row = useMemo(() => getProject(db, id), [db, id]);

  if (!row) {
    return (
      <div className="rounded-lg border bg-surface">
        <EmptyState message="This project does not exist." action={{ label: "Back to projects", href: "/projects" }} />
      </div>
    );
  }
  const { project } = row;
  const gst = db.gstRegistrations.find((g) => g.id === project.gstRegistrationId);
  const billing = getProjectBilling(db, id);
  const subs = listSubcontractorAssignments(db, { projectId: id });
  const invoices = listInvoices(db, { projectId: id });
  const reports = getDailyReports(db, { projectId: id });
  const snapshots = db.progressSnapshots.filter((s) => s.projectId === id).sort((a, b) => a.month.localeCompare(b.month));
  const boq = db.boqItems.filter((b) => b.projectId === id);
  const progressData = snapshots.map((s) => ({ month: formatMonth(s.month), Planned: Number(s.plannedPct), Actual: Number(s.actualPct) }));
  const acc: Record<string, { month: string; Billed: number; Received: number }> = {};
  [...invoices].reverse().forEach((r) => {
    const k = r.invoice.invoiceDate.slice(0, 7);
    acc[k] ??= { month: k, Billed: 0, Received: 0 };
    acc[k].Billed += moneyToNumber(r.invoice.total);
    acc[k].Received += moneyToNumber(r.invoice.receivedAmount);
  });
  const byMonth = Object.values(acc).map((d) => ({ ...d, month: formatMonth(d.month) }));
  const money = (v: unknown) => formatINR(Number(v), { compact: true });
  const statusBadge = <StatusBadge tone={row.status.systemKey === "COMPLETED" ? "success" : "accent"} label={row.status.name} />;

  return (
    <>
      <PageHeader
        title={project.name}
        status={statusBadge}
        description={`${project.code} · ${row.site?.name ?? row.organisationName} · ${row.regionName}`}
        secondaryActions={[{ label: "All projects", href: "/projects" }]}
      />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiTile label="Contract value" value={formatINR(project.contractValue, { compact: true })} />
            <KpiTile label="Progress" value={`${Math.round(row.progressPct)}%`} hint={`Plan ${Math.round(row.plannedPct)}%`} />
            <KpiTile label="Billed" value={formatINR(billing.invoicedTotal, { compact: true })} />
            <KpiTile label="Outstanding" value={formatINR(billing.outstanding, { compact: true })} />
          </div>
          <Section title="Project details">
            <div className="rounded-lg border bg-surface p-4">
              <FieldGrid
                fields={[
                  { label: "Project code", value: project.code },
                  { label: "Customer", value: row.organisationName },
                  { label: "Plant site", value: row.site?.name },
                  { label: "Region", value: row.regionName },
                  { label: "Work order no.", value: project.workOrderNo },
                  { label: "Work order date", value: formatDate(project.workOrderDate) },
                  { label: "Service line", value: row.serviceLineName },
                  { label: "Contract type", value: project.contractType === "SERVICE" ? "Service contract" : "Fixed scope" },
                  { label: "Billing cycle", value: label(project.billingCycle) },
                  { label: "Payment terms", value: `${project.paymentTermsDays} days` },
                  { label: "Contract value", value: formatINR(project.contractValue) },
                  { label: "GSTIN", value: gst ? `${gst.gstin} (${gst.tradeName ?? gst.legalName})` : "—" },
                  { label: "Start date", value: formatDate(project.startDate) },
                  { label: "Planned end", value: `${formatDate(project.plannedEndDate)}${row.daysToEnd > 0 ? ` · ${row.daysToEnd} days left` : ""}` },
                  { label: "Project manager", value: row.managerName },
                  { label: "Status", value: statusBadge },
                  { label: "Health", value: <StatusBadge status={row.health} /> },
                ]}
              />
            </div>
          </Section>
        </div>
      )}

      {tab === "progress" && (
        <div className="space-y-6">
          <div className="rounded-lg border bg-surface p-4">
            <p className="mb-2 text-xs text-muted-foreground">Executed vs time-based plan (marker)</p>
            <ProgressBar value={row.progressPct} marker={row.plannedPct} />
          </div>
          <ChartCard
            title="Progress over time"
            unit="% of contract value, month end"
            isEmpty={progressData.length === 0}
            legend={
              <>
                <LegendItem color="var(--chart-1)" label="Actual" />
                <LegendItem color="var(--chart-4)" label="Planned" />
              </>
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={progressData} margin={{ left: -16, right: 8, top: 4 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={axis} tickLine={false} axisLine={false} domain={[0, 100]} unit="%" />
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Line dataKey="Planned" stroke="var(--chart-4)" strokeDasharray="4 3" dot={false} strokeWidth={2} />
                <Line dataKey="Actual" stroke="var(--chart-1)" dot={false} strokeWidth={3} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <Section title="Work items (BOQ)">
            <DataTable
              caption="BOQ items"
              rows={boq}
              getRowId={(b) => b.id}
              emptyMessage="No BOQ items yet."
              columns={[
                { key: "d", header: "Item", mobile: "title", cell: (b) => <span><span className="text-muted-foreground">{b.itemNo}</span> {b.description}</span> },
                { key: "q", header: "Quantity", numeric: true, cell: (b) => `${b.quantity} ${b.unit}` },
                { key: "e", header: "Executed", numeric: true, cell: (b) => `${b.executedQty} ${b.unit}` },
                { key: "a", header: "Amount", numeric: true, cell: (b) => formatINR(b.amount, { compact: true }) },
                { key: "p", header: "Done", className: "min-w-32", cell: (b) => <ProgressBar value={(Number(b.executedQty) / Number(b.quantity || 1)) * 100} /> },
              ]}
            />
          </Section>
        </div>
      )}

      {tab === "subs" && (
        <Section title="Trade-wise subcontractors">
          <DataTable caption="Subcontractor assignments" rows={subs} getRowId={(r) => r.workOrder.id} columns={subCols} emptyMessage="No subcontractor is assigned to this project." />
        </Section>
      )}

      {tab === "billing" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiTile label="Billed (incl. GST)" value={formatINR(billing.invoicedTotal, { compact: true })} hint={`${billing.invoiceCount} invoices`} />
            <KpiTile label="Received" value={formatINR(billing.received, { compact: true })} />
            <KpiTile label="Outstanding" value={formatINR(billing.outstanding, { compact: true })} hint={`Terms: ${project.paymentTermsDays} days`} />
          </div>
          <ChartCard
            title="Billed vs received"
            unit="₹, by invoice month"
            isEmpty={byMonth.length === 0}
            legend={
              <>
                <LegendItem color="var(--chart-1)" label="Billed" />
                <LegendItem color="var(--chart-4)" label="Received" />
              </>
            }
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byMonth} margin={{ left: -8, right: 8, top: 4 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={formatINRAxis} />
                <Tooltip formatter={money} />
                <Bar dataKey="Billed" fill="var(--chart-1)" stroke="var(--accent-strong)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Received" fill="var(--chart-4)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <Section title="Invoices">
            <DataTable caption="Project invoices" rows={invoices} getRowId={(r) => r.invoice.id} columns={invCols} pageSize={12} emptyMessage="No invoices raised yet." />
          </Section>
        </div>
      )}

      {tab === "reports" && (
        <Section
          title={`Daily reports (${reports.length})`}
          action={
            <Link href={`/daily-work/new?project=${id}`} className="text-sm font-medium text-accent-strong hover:underline">
              New report
            </Link>
          }
        >
          <DataTable
            caption="Daily reports"
            rows={reports}
            getRowId={(r) => r.id}
            getRowHref={(r) => `/daily-work/${r.id}`}
            columns={reportCols}
            pageSize={15}
            emptyMessage="No daily reports yet."
          />
        </Section>
      )}
    </>
  );
}
