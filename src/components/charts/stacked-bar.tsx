import Link from "next/link";
import { formatINR } from "@/lib/money";
import type { Segment } from "./transforms";

interface StackedBarProps {
  segments: Segment[];
  /** Colour per segment, same order. */
  colors: string[];
  hrefFor?: (segment: Segment) => string;
  testId?: string;
}

/** ONE horizontal stacked bar with a labelled, clickable legend table below (works at 360px, no colour-only meaning). */
export function StackedBar({ segments, colors, hrefFor, testId = "chart-stacked-bar" }: StackedBarProps) {
  return (
    <div data-testid={testId}>
      <div className="flex h-8 w-full overflow-hidden rounded-md border bg-muted" role="img" aria-label={segments.map((s) => `${s.label}: ${formatINR(s.amount, { compact: true })}`).join(", ")}>
        {segments.map((s, i) =>
          s.pct > 0 ? (
            <span key={s.key} className="h-full border-r border-surface last:border-r-0" style={{ width: `${s.pct}%`, backgroundColor: colors[i % colors.length] }} title={`${s.label}: ${formatINR(s.amount, { compact: true })} (${Math.round(s.pct)}%)`} />
          ) : null,
        )}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {segments.map((s, i) => {
          const inner = (
            <>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }} aria-hidden="true" />
                {s.label} days
              </span>
              <span className="tabular block text-sm font-semibold">{formatINR(s.amount, { compact: "auto" })}</span>
              <span className="tabular block text-[11px] text-muted-foreground">
                {Math.round(s.pct)}%{s.count !== undefined ? ` · ${s.count} invoice${s.count === 1 ? "" : "s"}` : ""}
              </span>
            </>
          );
          return (
            <li key={s.key} data-testid={`${testId}-seg-${i}`}>
              {hrefFor ? (
                <Link href={hrefFor(s)} className="block min-h-11 rounded-md px-1.5 py-1 hover:bg-accent-subtle">
                  {inner}
                </Link>
              ) : (
                <div className="px-1.5 py-1">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
