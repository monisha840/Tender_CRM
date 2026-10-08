/** Pure chart data transformations (unit-tested in transforms.test.ts). No React, no data-layer imports. */

export interface FunnelInput {
  stageId: string;
  stage: string;
  count: number;
  value: number;
}

export interface FunnelStage extends FunnelInput {
  /** Tenders (and value) that reached this stage or went further, including the won tenders. */
  reachedCount: number;
  reachedValue: number;
  /** reached / previous reached, 0-100; null for the first stage or when the previous stage is empty. */
  conversionPct: number | null;
  /** Bar width relative to the first stage, 0-100 (never below `minWidth` when non-empty). */
  widthPct: number;
  /** The final (won) step has no stage id to drill into. */
  isWon: boolean;
}

/**
 * Builds a cumulative funnel from per-stage counts (ordered by stage sequence) plus the won tenders as the last step.
 * "Reached" means in that stage now or already beyond it, so the funnel only ever narrows.
 */
export function buildFunnel(stages: FunnelInput[], won: { label: string; count: number; value: number }, minWidth = 14): FunnelStage[] {
  const steps: (FunnelInput & { isWon: boolean })[] = [
    ...stages.map((s) => ({ ...s, isWon: false })),
    { stageId: "__won", stage: won.label, count: won.count, value: won.value, isWon: true },
  ];
  const reachedCount: number[] = [];
  const reachedValue: number[] = [];
  let c = 0;
  let v = 0;
  for (let i = steps.length - 1; i >= 0; i--) {
    c += steps[i].count;
    v += steps[i].value;
    reachedCount[i] = c;
    reachedValue[i] = v;
  }
  const top = reachedCount[0] ?? 0;
  return steps.map((s, i) => ({
    ...s,
    reachedCount: reachedCount[i],
    reachedValue: reachedValue[i],
    conversionPct: i === 0 || reachedCount[i - 1] === 0 ? null : (reachedCount[i] / reachedCount[i - 1]) * 100,
    widthPct: top === 0 ? 0 : Math.max(reachedCount[i] > 0 ? minWidth : 0, (reachedCount[i] / top) * 100),
  }));
}

export interface Segment {
  key: string;
  label: string;
  amount: number;
  count?: number;
  /** Share of the total, 0-100. */
  pct: number;
}

/** Shares of a total for stacked bars and donuts; zero-amount items are kept (pct 0) so legends stay stable. */
export function toSegments(items: { key: string; label: string; amount: number; count?: number }[]): Segment[] {
  const total = items.reduce((a, i) => a + Math.max(0, i.amount), 0);
  return items.map((i) => ({ ...i, amount: Math.max(0, i.amount), pct: total > 0 ? (Math.max(0, i.amount) / total) * 100 : 0 }));
}

/** Receivables ageing buckets (as produced by the dashboard selector) to stacked-bar segments. */
export function ageingSegments(aging: { bucket: string; amount: number; count: number }[]): Segment[] {
  return toSegments(aging.map((a) => ({ key: a.bucket, label: a.bucket, amount: a.amount, count: a.count })));
}

/** Share of ageing money that is older than the first bucket, 0-100. */
export function overdueShare(aging: { amount: number }[]): number {
  const total = aging.reduce((a, b) => a + b.amount, 0);
  return total > 0 ? ((total - (aging[0]?.amount ?? 0)) / total) * 100 : 0;
}

export interface HeatCell {
  date: string;
  count: number;
  titles: string[];
}

/** `days` consecutive dates from `start` (YYYY-MM-DD, UTC arithmetic), each with the deadlines falling on it. */
export function deadlineHeat(start: string, days: number, items: { date: string; title: string }[]): HeatCell[] {
  const base = new Date(`${start}T00:00:00Z`).getTime();
  const byDate = new Map<string, string[]>();
  items.forEach((i) => byDate.set(i.date, [...(byDate.get(i.date) ?? []), i.title]));
  return Array.from({ length: days }, (_, k) => {
    const date = new Date(base + k * 86_400_000).toISOString().slice(0, 10);
    const titles = byDate.get(date) ?? [];
    return { date, count: titles.length, titles };
  });
}

/** Heat level 0-3 for a count, used to pick a fill. */
export function heatLevel(count: number): 0 | 1 | 2 | 3 {
  return count <= 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3;
}

/** Clamp a percentage to 0-100; null/NaN become 0. */
export function clampPct(v: number | null | undefined): number {
  if (v === null || v === undefined || Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/** Text for a days-left badge: "Today", "Tomorrow", "in 5 days", "2 days overdue". */
export function daysLeftLabel(days: number): string {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1) return `in ${days} days`;
  return `${-days} day${days === -1 ? "" : "s"} overdue`;
}

export type DeadlineTone = "danger" | "warning" | "neutral";
export function deadlineTone(days: number): DeadlineTone {
  return days <= 2 ? "danger" : days <= 7 ? "warning" : "neutral";
}

/** Drops non-finite values so a sparkline never receives NaN. */
export function sparkPoints(values: number[] | undefined): number[] {
  return (values ?? []).filter((v) => Number.isFinite(v));
}

/** Positive items sorted by value; a long tail is folded into "Other". */
export function treemapItems(items: { name: string; value: number }[], maxItems = 8): { name: string; value: number }[] {
  const pos = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  if (pos.length <= maxItems) return pos;
  const head = pos.slice(0, maxItems - 1);
  const rest = pos.slice(maxItems - 1).reduce((a, b) => a + b.value, 0);
  return [...head, { name: "Other", value: rest }];
}
