"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BellRing, CalendarClock, ChevronRight, FileWarning } from "lucide-react";
import { DeadlineBadge, StageBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { getUpcomingDeadlines, missingMandatoryDocs, reminderBand, type TenderRow } from "@/lib/data/tenders";
import { formatDateTime } from "@/lib/dates";
import { formatINR } from "@/lib/money";
import { useDb, useRegionFilter } from "@/store/hooks";

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
  const db = useDb();
  const { region } = useRegionFilter();
  const rows = useMemo(() => getUpcomingDeadlines(db, region, withinDays), [db, region, withinDays]);
  const missing = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.tender.id, missingMandatoryDocs(db.tenderDocumentItems.filter((d) => d.tenderId === r.tender.id)).length));
    return m;
  }, [db.tenderDocumentItems, rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-surface">
        <EmptyState icon={CalendarClock} message={`No tender deadlines in the next ${withinDays} days for this selection.`} />
      </div>
    );
  }

  const shown = limit ? rows.slice(0, limit) : rows;
  const groups = BANDS.map((b) => ({ ...b, items: shown.filter((r) => reminderBand(r.daysToDeadline) === b.key) })).filter((g) => g.items.length);

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={String(g.key)} aria-label={g.title}>
          <div className="mb-1.5 flex items-center gap-2 px-1">
            {g.key !== null && <BellRing className="size-3.5 text-muted-foreground" aria-hidden="true" />}
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
      <Link href={`/tenders/${t.id}`} className="flex min-h-11 items-center gap-3 px-3 py-3 hover:bg-accent-subtle">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 text-sm font-medium">{t.title}</p>
            <DeadlineBadge value={t.submissionDeadlineAt} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t.tenderNo} · {row.organisationName} · {row.regionName}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="tabular text-muted-foreground">Closes {formatDateTime(t.submissionDeadlineAt)}</span>
            <span className="tabular text-muted-foreground">EMD {formatINR(t.emdAmount, { compact: "auto" })}</span>
            <StageBadge name={row.stage.name} kind={row.stage.kind} />
            {missingDocs > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-status-warning">
                <FileWarning className="size-3.5" aria-hidden="true" />
                {missingDocs} mandatory document{missingDocs === 1 ? "" : "s"} not ready
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}
