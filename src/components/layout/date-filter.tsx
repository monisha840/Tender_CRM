"use client";

import { CalendarDays, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_TODAY } from "@/lib/dates";
import { useSessionStore } from "@/store/session-store";

/** "As of" date for every dashboard and list. Defaults to today; remembered between visits. */
export function DateFilterControl() {
  const asOf = useSessionStore((s) => s.asOfDate);
  const setAsOf = useSessionStore((s) => s.setAsOfDate);

  return (
    <div className="flex items-center gap-1">
      <label className="relative flex items-center">
        <span className="sr-only">View data as of date</span>
        <CalendarDays className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden="true" />
        <Input
          type="date"
          value={asOf ?? DEMO_TODAY}
          max={DEMO_TODAY}
          onChange={(e) => setAsOf(e.target.value && e.target.value !== DEMO_TODAY ? e.target.value : null)}
          className="h-11 w-37 pl-8 md:h-9"
        />
      </label>
      {asOf && (
        <Button variant="ghost" size="icon" onClick={() => setAsOf(null)} aria-label="Reset to today" title="Reset to today">
          <RotateCcw aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
