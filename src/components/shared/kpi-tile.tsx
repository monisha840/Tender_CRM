import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface KpiTileProps {
  label: string;
  /** Pre-formatted value, e.g. formatINR(x, { compact: true }). */
  value: string;
  /** Small supporting line, e.g. "3 overdue". */
  hint?: string;
  icon?: LucideIcon;
  /** Change vs previous period. `good` says whether the direction is favourable. */
  delta?: { text: string; direction: "up" | "down"; good: boolean };
  /** Flat sparkline of recent values. */
  trend?: number[];
  /** Makes the whole tile a link (drill-down). */
  href?: string;
  className?: string;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 80;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-6 w-20 shrink-0" role="img" aria-label="Trend over recent days">
      <polyline points={points} fill="none" stroke="var(--chart-1)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Summary tile for genuinely separate headline numbers (the one place cards are appropriate). */
export function KpiTile({ label, value, hint, icon: Icon, delta, trend, href, className }: KpiTileProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
      </div>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="tabular text-2xl font-semibold tracking-tight">{value}</p>
        {trend && <Sparkline values={trend} />}
      </div>
      {(hint || delta) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {delta && (
            <span className={cn("inline-flex items-center gap-0.5 font-medium", delta.good ? "text-status-success" : "text-status-danger")}>
              {delta.direction === "up" ? <ArrowUpRight className="size-3" aria-hidden="true" /> : <ArrowDownRight className="size-3" aria-hidden="true" />}
              {delta.text}
            </span>
          )}
          {hint && <span>{hint}</span>}
        </div>
      )}
    </>
  );
  const base = "block rounded-lg border bg-surface p-4";
  return href ? (
    <Link href={href} className={cn(base, "transition-colors hover:bg-accent-tint/50", className)}>
      {body}
    </Link>
  ) : (
    <div className={cn(base, className)}>{body}</div>
  );
}
