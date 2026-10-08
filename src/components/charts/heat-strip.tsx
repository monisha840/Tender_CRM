import Link from "next/link";
import { cn } from "@/lib/utils";
import { heatLevel, type HeatCell } from "./transforms";

const LEVEL = ["bg-muted", "bg-accent-subtle", "bg-chart-3 text-accent-foreground", "bg-accent text-accent-foreground"] as const;

/** Calendar heat strip: one cell per day, the count is printed in the cell so colour is never the only signal. */
export function HeatStrip({ cells, href, testId = "chart-heat-strip" }: { cells: HeatCell[]; href: string; testId?: string }) {
  return (
    <div data-testid={testId}>
      <ul className="grid grid-cols-10 gap-1 sm:grid-cols-15" aria-label="Bid deadlines over the next 30 days">
        {cells.map((c, i) => (
          <li key={c.date}>
            <Link
              href={href}
              title={c.count ? `${c.date}: ${c.titles.join(", ")}` : `${c.date}: no bids close`}
              aria-label={`${c.date}: ${c.count} bid${c.count === 1 ? "" : "s"} closing`}
              className={cn("tabular flex h-7 items-center justify-center rounded-sm border text-[11px] hover:border-accent-strong", LEVEL[heatLevel(c.count)], i === 0 && "border-accent-strong")}
            >
              {c.count > 0 ? c.count : ""}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>Today</span>
        <span>+30 days</span>
      </p>
    </div>
  );
}
