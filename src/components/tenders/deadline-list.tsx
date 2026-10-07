"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BellRing, CalendarClock, ChevronRight, FileWarning } from "lucide-react";
import { DeadlineBadge, StageBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { tenderTone, toneClass } from "./urgency";
import { getUpcomingDeadlines, listTenders, missingMandatoryDocs, reminderBand, type TenderRow } from "@/lib/data/tenders";
import { formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { useRegionFilter } from "@/store/hooks";
import { useAsOfDb } from "@/components/layout/use-as-of-db";

const BANDS: { key: 1 | 3 | 7 | null; title: string; hint: string }[] = [
  { key: 1, title: "Due within 1 day", hint: "Final reminder" },
  { key: 3, title: "Due within 3 days", hint: "Second reminder" },
  { key: 7, title: "Due within 7 days", hint: "First reminder" },
  { key: null, title: "Later this month", hint: "No reminder yet" },
];

/**
 * Open tenders with a submission deadline coming up, grouped by the 7 / 3 / 1 day reminder bands.
 * `limit` shows a short version for the register page.
 */
export function DeadlineList({ withinDays = 30, limit }: { withinDays?: number; limit?: number }) {
  const db = useAsOfDb();
  const { region } = useRegionFilter();
  const rows = useMemo(() => getUpcomingDeadlines(db, region, withinDays), [db, region, withinDays]);
  // Overdue open tenders are the most urgent; shown on the full page only (not the short register version).
  const overdue = useMemo(
    () => (limit ? [] : listTenders(db, { region, stageKind: "OPEN" }).filter((r) => r.stage.systemKey !== "SUBMITTED" && r.daysToDeadline < 0).sort((a, b) => b.daysToDeadline - a.daysToDeadline)),
    [db, region, limit],
  );
  const missing = useMemo(() => {
    const m = new Map<string, number>();
    [...overdue, ...rows].forEach((r) => m.set(r.tender.id, missingMandatoryDocs(db.tenderDocumentItems.filter((d) => d.tenderId === r.tender.id)).length));
    return m;
  }, [db.tenderDocumentItems, rows, overdue]);

  if (rows.length === 0 && overdue.length === 0) {
    return (
      <div className="rounded-lg border bg-surface">
        <EmptyState icon={CalendarClock} message={`No tender deadlines in the next ${withinDays} days for this selection.`} />
      </div>
    );
  }

  const shown = limit ? rows.slice(0, limit) : rows;
  const groups = [
    ...(overdue.length ? [{ key: "overdue" as const, title: "Deadline passed", hint: "Not yet submitted", items: overdue }] : []),
    ...BANDS.map((b) => ({ ...b, items: shown.filter((r) => reminderBand(r.daysToDeadline) === b.key) })),
  ].filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={String(g.key)} aria-label={g.title}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            {g.key !== null && g.key !== "overdue" && <BellRing className="size-3.5 text-muted-foreground" aria-hidden="true" />}
            <h3 className="text-sm font-semibold">{g.title}</h3>
            <span className="text-xs text-muted-foreground">
              {g.items.length} · {g.hint}
            </span>
          </div>
          <ul className="divide-y rounded-lg border bg-surface">
            {g.items.map((r) => (
              <DeadlineRow key={r.tender.id} row={r} missingDocs={missing.get(r.tender.id) ?? 0} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DeadlineRow({ row, missingDocs }: { row: TenderRow; missingDocs: number }) {
  const t = row.tender;
  return (
    <li>
      <Link href={`/tenders/${t.id}`} className={cn("flex min-h-11 items-center gap-3 px-4 py-3.5 hover:bg-accent-subtle", toneClass(tenderTone(row)))}>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm leading-snug font-medium">{t.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {t.tenderNo} · {row.organisationName} · {row.regionName}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <DeadlineBadge value={t.submissionDeadlineAt} />
              <span className="tabular text-xs whitespace-nowrap text-muted-foreground">{formatDateTime(t.submissionDeadlineAt)}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <StageBadge name={row.stage.name} kind={row.stage.kind} />
            <span className="tabular text-muted-foreground">EMD <span className="font-medium text-foreground">{formatINR(t.emdAmount, { compact: "auto" })}</span></span>
            {missingDocs > 0 && (
              <span className="inline-flex items-center gap-1 text-status-warning">
                <FileWarning className="size-3.5" aria-hidden="true" />
                {missingDocs} mandatory doc{missingDocs === 1 ? "" : "s"} missing
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
