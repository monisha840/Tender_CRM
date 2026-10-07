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
          "relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-surface focus-within:ring-2 focus-within:ring-ring lg:size-auto lg:cursor-auto lg:border-0 lg:bg-transparent lg:focus-within:ring-0",
          asOf && "border-accent-strong bg-accent-subtle",
        )}
        title={asOf ? `Viewing data as of ${formatDate(asOf)}` : "View data as of a past date"}
      >
        <CalendarDays className="size-4 text-muted-foreground lg:pointer-events-none lg:absolute lg:left-2.5" aria-hidden="true" />
        <input
          type="date"
          value={asOf ?? DEMO_TODAY}
          max={DEMO_TODAY}
          onChange={(e) => setAsOf(e.target.value && e.target.value !== DEMO_TODAY ? e.target.value : null)}
          className="absolute inset-0 size-full cursor-pointer opacity-0 lg:static lg:h-9 lg:w-37 lg:cursor-text lg:rounded-md lg:border lg:bg-surface lg:pr-2 lg:pl-8 lg:text-sm lg:opacity-100 lg:focus-visible:ring-2 lg:focus-visible:ring-ring lg:focus-visible:outline-none"
          aria-label="View data as of date"
        />
      </label>
      {asOf && (
        <Button variant="ghost" size="icon" onClick={() => setAsOf(null)} aria-label="Reset to today" title="Reset to today" className="hidden lg:inline-flex">
          <RotateCcw aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
