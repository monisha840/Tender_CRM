import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { StatusTone } from "./status-badge";

export interface TimelineEntry {
  id: string;
  title: string;
  description?: ReactNode;
  /** Pre-formatted, e.g. formatDateTime(...). */
  time?: string;
  /** Who did it. */
  by?: string;
  tone?: StatusTone;
  /** Hollow marker for a step that has not happened yet. */
  upcoming?: boolean;
}

const DOT: Record<StatusTone, string> = {
  success: "bg-status-success",
  warning: "bg-status-warning",
  danger: "bg-status-danger",
  neutral: "bg-status-neutral",
  accent: "bg-accent",
};

/** Vertical timeline for tender stages, approval history and the audit trail. Newest-last by default. */
export function Timeline({ entries, className }: { entries: TimelineEntry[]; className?: string }) {
  return (
    <ol className={cn("relative", className)}>
      {entries.map((e, i) => {
        const last = i === entries.length - 1;
        return (
          <li key={e.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!last && <span className="absolute top-3 left-[5px] h-full w-px bg-border" aria-hidden="true" />}
            <span
              className={cn(
                "relative mt-1.5 size-[11px] shrink-0 rounded-full",
                e.upcoming ? "border-2 border-border bg-surface" : DOT[e.tone ?? "accent"],
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className={cn("text-sm font-medium", e.upcoming && "text-muted-foreground")}>{e.title}</p>
                {e.time && <p className="tabular text-xs text-muted-foreground">{e.time}</p>}
              </div>
              {e.by && <p className="text-xs text-muted-foreground">{e.by}</p>}
              {e.description && <div className="mt-1 text-sm text-muted-foreground">{e.description}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
