"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { ImportExport } from "@/components/data/import-export";
import { DeadlineBadge, StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import type { InvoiceRow } from "@/lib/data/accounts";
import { formatINR, formatINRAxis, moneyToNumber } from "@/lib/money";
import { cn } from "@/lib/utils";
import { ageingTotals, ageingBucketOf, type AgeingBucket } from "@/lib/data/definitions";
import { invoiceTone, Stack, useInvoiceRows } from "./helpers";

interface Row {
  row: InvoiceRow;
  age: number;
  bucket: AgeingBucket;
}

/** Outstanding invoices aged by days past the payment due date: 0–30, 31–60, 61–90, 90+ (definition in lib/data/definitions.ts, shared with the dashboard). */
export function Receivables() {
  const invoices = useInvoiceRows();
  const [bucket, setBucket] = useState<AgeingBucket | "ALL">("ALL");

  const open = useMemo<Row[]>(
    () =>
      invoices
        .filter((r) => moneyToNumber(r.outstanding) > 0)
        .map((row) => {
          const age = row.daysOverdue;
          return { row, age, bucket: ageingBucketOf(age) };
        })
        .sort((a, b) => b.age - a.age),
    [invoices],
  );

  const buckets = useMemo(() => ageingTotals(open, (r) => r.age, (r) => r.row.outstanding), [open]);
  const total = buckets.reduce((t, b) => t + b.amount, 0);
  const rows = bucket === "ALL" ? open : open.filter((r) => r.bucket === bucket);

  const columns: DataTableColumn<Row>[] = [
    { key: "invoice", header: "Invoice", mobile: "title", cell: (r) => <Stack main={r.row.invoice.invoiceNo} sub={[formatDate(r.row.invoice.invoiceDate)]} /> },
    { key: "customer", header: "Customer", sortValue: (r) => r.row.organisationName, cell: (r) => <Stack main={r.row.organisationName} sub={[r.row.projectName]} /> },
    { key: "age", header: "Days past due", numeric: true, sortValue: (r) => r.age, cell: (r) => (r.age ? `${r.age} days` : "Not yet due") },
    { key: "bucket", header: "Bucket", cell: (r) => r.bucket },
    { key: "due", header: "Payment due", cell: (r) => <Stack main={formatDate(r.row.invoice.dueDate)} sub={[<DeadlineBadge key="d" value={r.row.invoice.dueDate} />]} /> },
    { key: "net", header: "Receivable", numeric: true, cell: (r) => formatINR(r.row.invoice.netReceivable) },
    { key: "out", header: "Outstanding", numeric: true, sortValue: (r) => moneyToNumber(r.row.outstanding), cell: (r) => <span className="font-medium">{formatINR(r.row.outstanding)}</span> },
    { key: "status", header: "Status", mobile: "badge", cell: (r) => <StatusBadge status={r.row.daysOverdue > 0 ? "OVERDUE" : r.row.invoice.paymentStatus} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {buckets.map((b) => (
          <button
            key={b.bucket}
            type="button"
            aria-pressed={bucket === b.bucket}
            onClick={() => setBucket((cur) => (cur === b.bucket ? "ALL" : b.bucket))}
            className={cn(
              "min-h-11 rounded-lg border bg-surface p-4 text-left transition-colors hover:bg-accent-subtle",
              bucket === b.bucket && "border-accent-strong bg-accent-subtle",
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">{b.bucket} days past due</p>
            <p className="tabular mt-1 text-xl font-semibold tracking-tight">{formatINR(b.amount, { compact: true })}</p>
            <p className="text-xs text-muted-foreground">
              {b.count} invoice{b.count === 1 ? "" : "s"} · {total ? Math.round((b.amount / total) * 100) : 0}%
            </p>
          </button>
        ))}
      </div>

      <ChartCard title="Receivables ageing" unit="₹ outstanding, by days past due date (not yet due counts in 0–30)" isEmpty={total === 0} emptyMessage="Nothing outstanding." heightClassName="h-52 md:h-60">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={buckets} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="bucket" tickFormatter={(b) => `${b} d`} tickLine={false} axisLine={false} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
            <YAxis tickFormatter={formatINRAxis} tickLine={false} axisLine={false} width={56} tick={{ fill: "var(--text-secondary)", fontSize: 11 }} />
            <Tooltip
              cursor={{ fill: "var(--accent-subtle)" }}
              formatter={(v) => [formatINR(Number(v)), "Outstanding"]}
              labelFormatter={(b) => `${b} days`}
              contentStyle={{ borderRadius: 8, border: "1px solid var(--border)", fontSize: 12 }}
            />
            <Bar dataKey="amount" radius={[3, 3, 0, 0]} stroke="var(--accent-strong)" strokeWidth={1} isAnimationActive={false} onClick={(d) => setBucket((d as unknown as { bucket: AgeingBucket }).bucket)}>
              {buckets.map((b) => (
                <Cell key={b.bucket} fill="var(--chart-1)" fillOpacity={bucket === "ALL" || bucket === b.bucket ? 1 : 0.35} cursor="pointer" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ImportExport
        filename="receivables"
        headers={["Invoice no", "Invoice date", "Customer", "Project", "Days past due", "Bucket", "Payment due", "Days overdue", "Receivable", "Outstanding", "Status"]}
        rows={rows.map((r) => [r.row.invoice.invoiceNo, r.row.invoice.invoiceDate, r.row.organisationName, r.row.projectName, r.age, r.bucket, r.row.invoice.dueDate, r.row.daysOverdue, r.row.invoice.netReceivable, r.row.outstanding, r.row.daysOverdue > 0 ? "Overdue" : r.row.invoice.paymentStatus])}
      />
      <DataTable
        getRowTone={(r) => invoiceTone(r.row)}
        caption="Outstanding invoices"
        columns={columns}
        rows={rows}
        getRowId={(r) => r.row.invoice.id}
        getRowHref={(r) => `/finance/invoices/${r.row.invoice.id}`}
        emptyMessage="No outstanding invoices in this bucket."
        pageSize={15}
        toolbar={
          bucket !== "ALL" ? (
            <Button variant="ghost" size="sm" onClick={() => setBucket("ALL")}>
              Showing {bucket} days · clear
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
