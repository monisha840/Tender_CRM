import Link from "next/link";
import { cn } from "@/lib/utils";
import { daysLeftLabel, deadlineTone, type DeadlineTone } from "./transforms";

export interface TimelineItem {
  id: string;
  title: string;
  meta: string;
  days: number;
  href: string;
}

const TONE: Record<DeadlineTone, { dot: string; badge: string }> = {
  danger: { dot: "bg-status-danger", badge: "bg-status-danger-tint text-status-danger" },
  warning: { dot: "bg-status-warning", badge: "bg-status-warning-tint text-status-warning" },
  neutral: { dot: "bg-status-neutral", badge: "bg-status-neutral-tint text-status-neutral" },
};

/** Vertical timeline of upcoming deadlines, soonest first, each with a days-left badge (text, not colour alone). */
export function DeadlineTimeline({ items, testId = "chart-deadline-timeline" }: { items: TimelineItem[]; testId?: string }) {
  return (
    <ol className="relative ml-1.5 border-l pl-4" data-testid={testId}>
      {items.map((it) => {
        const tone = TONE[deadlineTone(it.days)];
        return (
          <li key={it.id} className="relative pb-1 last:pb-0">
            <span className={cn("absolute top-5 -left-[21px] size-2.5 rounded-full ring-2 ring-surface", tone.dot)} aria-hidden="true" />
            <Link href={it.href} className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-accent-subtle">
              <span className="min-w-0">
                <span className="line-clamp-1 block text-sm font-medium">{it.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{it.meta}</span>
              </span>
              <span className={cn("tabular shrink-0 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap", tone.badge)}>{daysLeftLabel(it.days)}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
