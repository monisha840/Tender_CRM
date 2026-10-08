"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiTile } from "@/components/shared/kpi-tile";
import { formatINR } from "@/lib/money";
import { getProjectPnlAction, type ProjectPnlResult } from "@/modules/contract-pnl/actions";
import { FlagBadge, formatPct, MarginTrendChart } from "./pnl-parts";

/** "Profit & Loss" tab content for a project page. Loads its own data from the server (permission-checked). */
export function ProjectPnlTab({ projectId }: { projectId: string }) {
  const [res, setRes] = useState<ProjectPnlResult | null>(null);

  useEffect(() => {
    let live = true;
    getProjectPnlAction(projectId).then((r) => live && setRes(r));
    return () => {
      live = false;
    };
  }, [projectId]);

  if (!res) return <Skeleton className="h-64 w-full" data-testid="project-pnl-loading" />;
  if (!res.ok) return <div className="rounded-lg border bg-surface"><EmptyState message={res.message} /></div>;
  if (!res.data) return <div className="rounded-lg border bg-surface"><EmptyState message="No profit and loss yet for this project." /></div>;

  const p = res.data;
  const lines: { label: string; value: string; strong?: boolean; testId: string }[] = [
    { label: "Billed (excl. GST)", value: p.billed, testId: "pnl-billed" },
    { label: "Received", value: p.received, testId: "pnl-received" },
    { label: "Subcontractor bills", value: p.subCost, testId: "pnl-sub-cost" },
    { label: "Labour (payroll)", value: p.labourCost, testId: "pnl-labour-cost" },
    { label: "Other costs", value: p.otherCost, testId: "pnl-other-cost" },
    { label: "Total cost", value: p.totalCost, strong: true, testId: "pnl-total-cost" },
    { label: "Margin", value: p.margin, strong: true, testId: "pnl-margin" },
  ];

  return (
    <div className="space-y-6" data-testid="project-pnl">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Billed" value={formatINR(p.billed, { compact: true })} testId="pnl-kpi-billed" />
        <KpiTile label="Total cost" value={formatINR(p.totalCost, { compact: true })} testId="pnl-kpi-cost" />
        <KpiTile label="Margin" value={formatINR(p.margin, { compact: true })} hint={formatPct(p.marginPct)} testId="pnl-kpi-margin" />
        <div className="flex flex-col justify-center gap-1 rounded-lg border bg-surface p-4">
          <p className="text-xs font-medium text-muted-foreground">Status</p>
          <div><FlagBadge flag={p.flag} /></div>
          <p className="text-xs text-muted-foreground">Low margin below {res.lowMarginPct}%</p>
        </div>
      </div>

      <section className="rounded-lg border bg-surface" aria-label="Billed against cost">
        <h2 className="border-b px-4 py-3 text-sm font-semibold">Billed against cost</h2>
        <dl className="divide-y">
          {lines.map((l) => (
            <div key={l.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <dt className={l.strong ? "font-medium" : "text-muted-foreground"}>{l.label}</dt>
              <dd className={`tabular text-right ${l.strong ? "font-semibold" : ""}`} data-testid={l.testId}>{formatINR(l.value)}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="font-medium">Margin %</dt>
            <dd className="tabular text-right font-semibold" data-testid="pnl-margin-pct">{formatPct(p.marginPct)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
            <dt className="text-muted-foreground">Cash margin (received minus cost)</dt>
            <dd className="tabular text-right" data-testid="pnl-cash-margin">{formatINR(p.cashMargin)}</dd>
          </div>
        </dl>
      </section>

      <MarginTrendChart monthly={p.monthly} />
    </div>
  );
}
