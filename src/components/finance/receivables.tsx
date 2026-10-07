"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartCard } from "@/components/charts/chart-card";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { ImportExport } from "@/components/data/import-export";
import { DeadlineBadge, StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import type { InvoiceRow } from "@/lib/data/accounts";
import { DASHBOARD_AGEING } from "@/lib/data/links";
import { useUrlState } from "@/lib/use-url-param";
import { formatINR, formatINRAxis, moneyToNumber, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AGEING_BUCKETS, bucketOf, invoiceAge, invoiceTone, Stack, useInvoiceRows, type AgeingBucket } from "./helpers";

interface Row {
  row: InvoiceRow;
  age: number;
  bucket: AgeingBucket;
}

/** Outstanding invoices aged by days since invoice date: 0–30, 31–60, 61–90, 90+. */
export function Receivables() {
  const invoices = useInvoiceRows();
  // Drill-downs from the dashboard arrive as ?overdue=1, ?ageing=<days past due band> and ?customer=<organisation id>.
  const [bucketParam, setBucketParam] = useUrlState("bucket", "ALL");
  const bucket: AgeingBucket | "ALL" = AGEING_BUCKETS.find((b) => b === bucketParam) ?? "ALL";
  const setBucket = (b: AgeingBucket | "ALL" | ((cur: AgeingBucket | "ALL") => AgeingBucket | "ALL")) => setBucketParam(typeof b === "function" ? b(bucket) : b);
  const [overdueOnly, setOverdueOnly] = useUrlState("overdue");
  const [ageing, setAgeing] = useUrlState("ageing");
  const [customer, setCustomer] = useUrlState("customer");
  const ageingBand = DASHBOARD_AGEING.find((a) => a.label === ageing);

  const open = useMemo<Row[]>(
    () =>
      invoices
        .filter((r) => moneyToNumber(r.outstanding) > 0)
        .map((row) => {
          const age = invoiceAge(row.invoice.invoiceDate);
          return { row, age, bucket: bucketOf(age) };
        })
        .sort((a, b) => b.age - a.age),
    [invoices],
  );

  const buckets = useMemo(
    () =>
      AGEING_BUCKETS.map((b) => {
        const rs = open.filter((r) => r.bucket === b);
        return { bucket: b, count: rs.length, amount: moneyToNumber(sumMoney(rs.map((r) => r.row.outstanding))) };
      }),
    [open],
  );
  const total = buckets.reduce((t, b) => t + b.amount, 0);
  const customerName = customer ? open.find((r) => r.row.invoice.organisationId === customer)?.row.organisationName ?? "this customer" : null;
  const rows = open
    .filter((r) => bucket === "ALL" || r.bucket === bucket)
    .filter((r) => overdueOnly !== "1" || r.row.daysOverdue > 0)
    .filter((r) => !ageingBand || ageingBand.test(r.row.daysOverdue))
    .filter((r) => !customer || r.row.invoice.organisationId === customer);
  const chips = [
    overdueOnly === "1" && { label: "Overdue only", clear: () => setOverdueOnly(null) },
    ageingBand && { label: `${ageingBand.label} past due`, clear: () => setAgeing(null) },
    customerName && { label: `Customer: ${customerName}`, clear: () => setCustomer(null) },
  ].filter((c): c is { label: string; clear: () => void } => !!c);

  const columns: DataTableColumn<Row>[] = [
    { key: "invoice", header: "Invoice", mobile: "title", cell: (r) => <Stack main={r.row.invoice.invoiceNo} sub={[formatDate(r.row.invoice.invoiceDate)]} /> },
    { key: "customer", header: "Customer", sortValue: (r) => r.row.organisationName, cell: (r) => <Stack main={r.row.organisationName} sub={[r.row.projectName]} /> },
    { key: "age", header: "Age", numeric: true, sortValue: (r) => r.age, cell: (r) => `${r.age} days` },
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
            <p className="text-xs font-medium text-muted-foreground">{b.bucket} days</p>
            <p className="tabular mt-1 text-xl font-semibold tracking-tight">{formatINR(b.amount, { compact: true })}</p>
            <p className="text-xs text-muted-foreground">
              {b.count} invoice{b.count === 1 ? "" : "s"} · {total ? Math.round((b.amount / total) * 100) : 0}%
            </p>
          </button>
        ))}
      </div>

      <ChartCard title="Receivables ageing" unit="₹ outstanding, by days since invoice date" isEmpty={total === 0} emptyMessage="Nothing outstanding." heightClassName="h-52 md:h-60">
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
        headers={["Invoice no", "Invoice date", "Customer", "Project", "Age (days)", "Bucket", "Payment due", "Days overdue", "Receivable", "Outstanding", "Status"]}
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
          <>
            {bucket !== "ALL" && (
              <Button variant="ghost" size="sm" onClick={() => setBucket("ALL")}>
                Showing {bucket} days · clear
              </Button>
            )}
            {chips.map((c) => (
              <Button key={c.label} variant="outline" size="sm" onClick={c.clear} aria-label={`Remove filter: ${c.label}`}>
                {c.label} ×
              </Button>
            ))}
          </>
        }
      />
    </div>
  );
}
