import Link from "next/link";
import { Lock } from "lucide-react";
import { formatINR } from "@/lib/money";
import { Sparkline } from "./sparkline";

export interface MoneyLockedItem {
  key: string;
  /** e.g. "EMD locked", "PBG locked", "Retention held". */
  label: string;
  amount: number;
  count?: number;
  /** Recent history for the sparkline; omit if unknown. */
  series?: number[];
  hint?: string;
  /** Drill-down list. */
  href?: string;
}

/**
 * "Money locked with clients" tiles. Pure presentation: the data provider is separate, so with no items this renders a
 * calm empty state instead of failing.
 */
export function MoneyLockedTiles({ items, testId = "chart-money-locked" }: { items?: MoneyLockedItem[]; testId?: string }) {
  if (!items || items.length === 0) {
    return (
      <div className="flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-md border border-dashed px-4 py-6 text-center" data-testid={`${testId}-empty`}>
        <Lock className="size-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">No money is locked with clients right now, or the figures are not available yet.</p>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3" data-testid={testId}>
      {items.map((it) => {
        const body = (
          <>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3.5 text-accent-strong" aria-hidden="true" />
              {it.label}
            </span>
            <span className="tabular mt-1 block text-xl leading-none font-semibold">{formatINR(it.amount, { compact: "auto" })}</span>
            <span className="tabular mt-1 block truncate text-xs text-muted-foreground">{it.hint ?? (it.count !== undefined ? `${it.count} item${it.count === 1 ? "" : "s"}` : "")}</span>
            <span className="mt-2 block">
              <Sparkline values={it.series} label={`${it.label} trend`} />
            </span>
          </>
        );
        return (
          <li key={it.key} data-testid={`${testId}-${it.key}`}>
            {it.href ? (
              <Link href={it.href} className="block min-h-11 rounded-lg border bg-surface p-3 hover:bg-accent-subtle">
                {body}
              </Link>
            ) : (
              <div className="rounded-lg border bg-surface p-3">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
