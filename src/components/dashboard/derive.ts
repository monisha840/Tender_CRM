import { getUpcomingTenderDeadlines, listTenders, entityHref, type RegionFilter } from "@/lib/data";
import { getToday, toIstDate } from "@/lib/dates";
import { moneyToNumber } from "@/lib/money";
import { deadlineHeat, type HeatCell } from "@/components/charts/transforms";
import type { TimelineItem } from "@/components/charts/deadline-timeline";
import type { Database } from "@/types";

/** Tenders closed without a bid: a NO_GO stage, or a result whose outcome is neutral. Value = estimate. */
export function cancelledTenders(db: Database, region: RegionFilter): { count: number; value: number; valueInLostStage: number } {
  const neutral = new Set(db.tenderResults.filter((r) => r.outcome === "NEUTRAL").map((r) => r.id));
  let count = 0;
  let value = 0;
  let valueInLostStage = 0;
  listTenders(db, { region }).forEach((r) => {
    const isNoGo = r.stage.kind === "NO_GO";
    const isNeutral = r.stage.kind === "LOST" && !!r.tender.resultId && neutral.has(r.tender.resultId);
    if (!isNoGo && !isNeutral) return;
    const v = moneyToNumber(r.bid?.quotedAmount ?? r.tender.estimatedValue);
    count += 1;
    value += v;
    if (isNeutral) valueInLostStage += v;
  });
  return { count, value, valueInLostStage };
}

/** Name of the stage the data marks as "won" (kind WON), for the funnel's last step. */
export function wonStageLabel(db: Database): string {
  return [...db.tenderStages].filter((s) => s.kind === "WON").sort((a, b) => a.sequence - b.sequence)[0]?.name ?? "Won";
}

/** Deadlines for the next 30 days: timeline items and heat-strip cells. */
export function deadlines30(db: Database, region: RegionFilter): { items: TimelineItem[]; heat: HeatCell[]; total: number } {
  const d = getUpcomingTenderDeadlines(db, region, 30);
  const items = d.rows.map((r) => ({
    id: r.tender.id,
    title: r.tender.title,
    meta: `${r.organisationShort} · ${r.stage.name}`,
    days: r.daysToDeadline,
    href: entityHref("TENDER", r.tender.id),
  }));
  const heat = deadlineHeat(getToday(), 30, d.rows.map((r) => ({ date: toIstDate(r.tender.submissionDeadlineAt), title: r.tender.title })));
  return { items, heat, total: d.count };
}
