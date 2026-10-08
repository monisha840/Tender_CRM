"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { DataTable, type DataTableColumn } from "@/components/shared/data-table";
import { KpiTile } from "@/components/shared/kpi-tile";
import { FilterPills } from "@/components/work/parts";
import { formatINR, moneyToNumber } from "@/lib/money";
import type { PortfolioPnl, ProjectPnlRow } from "@/modules/contract-pnl/service";
import { FlagBadge, formatPct, MarginTrendChart } from "./pnl-parts";

type Filter = "ALL" | "LOSS" | "LOW" | "OK";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "LOSS", label: "Loss-making" },
  { key: "LOW", label: "Low margin" },
  { key: "OK", label: "Healthy" },
];

export function ContractPnlView({ data }: { data: PortfolioPnl }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const watch = useMemo(() => data.projects.filter((p) => p.flag === "LOSS" || p.flag === "LOW").sort((a, b) => moneyToNumber(a.margin) - moneyToNumber(b.margin)), [data.projects]);
  const rows = useMemo(() => data.projects.filter((p) => filter === "ALL" || p.flag === filter), [data.projects, filter]);

  const columns: DataTableColumn<ProjectPnlRow>[] = [
    {
      key: "project",
      header: "Project",
      mobile: "title",
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <Link href={`/projects/${p.projectId}`} className="font-medium text-accent-strong underline-offset-2 hover:underline">{p.name}</Link>
          <p className="text-xs text-muted-foreground">{p.code} · {p.clientName}</p>
        </div>
      ),
    },
    { key: "billed", header: "Billed", numeric: true, sortValue: (p) => moneyToNumber(p.billed), cell: (p) => formatINR(p.billed, { compact: true }) },
    { key: "received", header: "Received", numeric: true, sortValue: (p) => moneyToNumber(p.received), cell: (p) => formatINR(p.received, { compact: true }) },
    { key: "cost", header: "Cost", numeric: true, sortValue: (p) => moneyToNumber(p.totalCost), cell: (p) => formatINR(p.totalCost, { compact: true }) },
    { key: "margin", header: "Margin", numeric: true, sortValue: (p) => moneyToNumber(p.margin), cell: (p) => <span data-testid="pnl-row-margin">{formatINR(p.margin, { compact: true })}</span> },
    { key: "pct", header: "Margin %", numeric: true, sortValue: (p) => p.marginPct ?? -999, cell: (p) => <span data-testid="pnl-row-pct">{formatPct(p.marginPct)}</span> },
    { key: "flag", header: "Status", mobile: "badge", sortValue: (p) => p.flag, cell: (p) => <FlagBadge flag={p.flag} /> },
  ];

  const t = data.totals;
  return (
    <>
      <PageHeader title="Contract P&L" description="Billed and received against subcontractor, labour and other cost, per contract." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Billed" value={formatINR(t.billed, { compact: true })} hint={`Received ${formatINR(t.received, { compact: true })}`} testId="kpi-pnl-billed" />
        <KpiTile label="Total cost" value={formatINR(t.totalCost, { compact: true })} testId="kpi-pnl-cost" />
        <KpiTile label="Margin" value={formatINR(t.margin, { compact: true })} hint={formatPct(t.marginPct)} testId="kpi-pnl-margin" />
        <KpiTile label="Contracts to watch" value={String(watch.length)} hint={`Loss or below ${data.lowMarginPct}% margin`} icon={AlertTriangle} testId="kpi-pnl-watch" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <MarginTrendChart monthly={data.monthly} title="Margin trend, all contracts" />
        </div>
        <section className="min-w-0 rounded-lg border bg-surface" aria-label="Contracts to watch" data-testid="pnl-watchlist">
          <h2 className="border-b px-4 py-3 text-sm font-semibold">Loss-making and low-margin</h2>
          {watch.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">Every billed contract is above {data.lowMarginPct}% margin.</p>
          ) : (
            <ul className="divide-y">
              {watch.slice(0, 8).map((p) => (
                <li key={p.projectId} className="flex items-center justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className="min-w-0">
                    <Link href={`/projects/${p.projectId}`} className="block truncate font-medium hover:underline">{p.name}</Link>
                    <span className="tabular text-xs text-muted-foreground">{formatINR(p.margin, { compact: true })} · {formatPct(p.marginPct)}</span>
                  </span>
                  <FlagBadge flag={p.flag} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-label="All contracts" className="rounded-lg border bg-surface">
        <div className="border-b p-4">
          <FilterPills options={FILTERS} value={filter} onChange={setFilter} />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(p) => p.projectId}
          getRowTestId={(p) => `pnl-row-${p.code}`}
          caption="Contract profit and loss"
          search={{ placeholder: "Search project or client", getText: (p) => `${p.name} ${p.code} ${p.clientName}` }}
          emptyMessage="No contracts match. Billing and cost appear here once a project has invoices or bills."
          pageSize={25}
        />
      </section>
      {moneyToNumber(data.unallocatedLabour) > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {formatINR(data.unallocatedLabour, { compact: true })} of payroll has no attendance to allocate it by, so it is not in any contract above.
        </p>
      )}
    </>
  );
}
