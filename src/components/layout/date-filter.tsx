"use client";

import { CalendarDays, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEMO_TODAY, formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/session-store";

/**
 * "As of" date for every dashboard and list: rows dated later are hidden and today's figures (overdue days, deadlines)
 * are worked out for that day. Defaults to today; remembered between visits.
 * On a phone it is an icon the size of a touch target (the native date picker opens from it), so the header fits at 360px.
 */
export function DateFilterControl() {
  const asOf = useSessionStore((s) => s.asOfDate);
  const setAsOf = useSessionStore((s) => s.setAsOfDate);

  return (
    <div className="flex items-center gap-1">
      <label
        className={cn(
          "relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-surface focus-within:ring-2 focus-within:ring-ring md:size-auto md:cursor-auto md:border-0 md:bg-transparent md:focus-within:ring-0",
          asOf && "border-accent-strong bg-accent-subtle",
        )}
        title={asOf ? `Viewing data as of ${formatDate(asOf)}` : "View data as of a past date"}
      >
        <CalendarDays className="size-4 text-muted-foreground md:pointer-events-none md:absolute md:left-2.5" aria-hidden="true" />
        <input
          type="date"
          value={asOf ?? DEMO_TODAY}
          max={DEMO_TODAY}
          onChange={(e) => setAsOf(e.target.value && e.target.value !== DEMO_TODAY ? e.target.value : null)}
          className="absolute inset-0 size-full cursor-pointer opacity-0 md:static md:h-9 md:w-37 md:cursor-text md:rounded-md md:border md:bg-surface md:pr-2 md:pl-8 md:text-sm md:opacity-100 md:focus-visible:ring-2 md:focus-visible:ring-ring md:focus-visible:outline-none"
          aria-label="View data as of date"
        />
      </label>
      {asOf && (
        <Button variant="ghost" size="icon" onClick={() => setAsOf(null)} aria-label="Reset to today" title="Reset to today" className="hidden md:inline-flex">
          <RotateCcw aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
