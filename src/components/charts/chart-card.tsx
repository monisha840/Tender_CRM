import type { ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  /** Every chart has a title… */
  title: string;
  /** …and clear units, e.g. "₹ Cr, by stage". */
  unit?: string;
  /** Optional control at the right of the header (a link, toggle…). */
  action?: ReactNode;
  /** Legend; sits below the chart so it stacks cleanly at 360px. */
  legend?: ReactNode;
  /** True shows the empty state instead of the chart. */
  isEmpty?: boolean;
  emptyMessage?: string;
  /** Chart height classes; charts resize to the container width. */
  heightClassName?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Consistent frame for every chart: title, units, optional action, legend below, empty state.
 * Put a Recharts <ResponsiveContainer> (or shadcn <ChartContainer>) inside as children.
 * Use `var(--chart-1)` (yellow, drawn with a 1px `--accent-strong` outline) first, then `--chart-2…5`; status colours only when the data is status.
 */
export function ChartCard({
  title,
  unit,
  action,
  legend,
  isEmpty,
  emptyMessage = "No data for this selection.",
  heightClassName = "h-60 md:h-72",
  className,
  children,
}: ChartCardProps) {
  return (
    <section className={cn("min-w-0 rounded-lg border bg-surface p-4", className)} aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {unit && <p className="text-xs text-muted-foreground">{unit}</p>}
        </div>
        {action}
      </div>
      {isEmpty ? (
        <EmptyState icon={BarChart3} message={emptyMessage} className={cn("py-0", heightClassName)} />
      ) : (
        <div className={cn("w-full", heightClassName)}>{children}</div>
      )}
      {legend && !isEmpty && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">{legend}</div>}
    </section>
  );
}

/** Legend entry with a colour chip, for the `legend` slot. */
export function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}
