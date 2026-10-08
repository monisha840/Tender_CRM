"use client";

import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/money";
import type { FunnelStage } from "./transforms";

const FILLS = ["var(--chart-1)", "var(--chart-1)", "var(--chart-3)", "var(--chart-2)", "var(--status-success)"];

interface FunnelChartProps {
  stages: FunnelStage[];
  /** Where a click on a stage goes. */
  hrefFor: (stage: FunnelStage) => string;
  testId?: string;
}

/**
 * Centered horizontal funnel built from plain markup so it stays crisp and readable at 360px.
 * Each row: stage name, count and value; a small conversion chip sits between rows.
 */
export function FunnelChart({ stages, hrefFor, testId = "chart-tender-funnel" }: FunnelChartProps) {
  return (
    <ol className="flex h-full flex-col justify-center gap-1" data-testid={testId} aria-label="Tender funnel">
      {stages.map((s, i) => (
        <li key={s.stageId}>
          {s.conversionPct !== null && (
            <div className="flex items-center justify-center gap-1 py-0.5 text-[11px] text-muted-foreground" data-testid={`${testId}-conversion-${i}`}>
              <ArrowDown className="size-3" aria-hidden="true" />
              <span className="tabular">{Math.round(s.conversionPct)}% move on</span>
            </div>
          )}
          <Link
            href={hrefFor(s)}
            data-testid={`${testId}-stage-${i}`}
            title={`${s.stage}: ${s.reachedCount} reached this stage or beyond (${s.count} in it now), ${formatINR(s.reachedValue, { compact: "auto" })}`}
            className="group flex min-h-11 flex-col items-center justify-center rounded-md hover:bg-accent-subtle"
          >
            <span className="flex w-full justify-center">
              <span
                className={cn("flex h-8 items-center justify-center rounded-sm border border-accent-strong/40 px-2 text-xs font-semibold whitespace-nowrap", i >= 3 ? "text-surface" : "text-accent-foreground")}
                style={{ width: `${s.widthPct}%`, minWidth: "3.5rem", backgroundColor: FILLS[Math.min(i, FILLS.length - 1)] }}
              >
                <span className="tabular">{s.reachedCount}</span>
              </span>
            </span>
            <span className="mt-0.5 flex max-w-full items-baseline gap-2 px-1 text-xs">
              <span className="truncate font-medium">{s.stage}</span>
              <span className="tabular shrink-0 text-muted-foreground">{formatINR(s.reachedValue, { compact: "auto" })}</span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
