import { daysBetween, DEMO_TODAY } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import type { ProjectInfo } from "./projects";

/** Budget split by expense category; sums to 100%. */
export const BUDGET_SHARE = {
  ec_materials: 0.34,
  ec_subcontract: 0.26,
  ec_labour: 0.16,
  ec_equipment: 0.14,
  ec_overheads: 0.1,
} as const;
export type CategoryId = keyof typeof BUDGET_SHARE;

/** Total planned cost is 88% of contract value (12% planned margin). */
export const BUDGET_TO_CONTRACT = 0.88;

export const contractRupees = (p: ProjectInfo): number => Number(toPaise(p.contractValue)) / 100;

export const budgetRupees = (p: ProjectInfo, category: CategoryId): number =>
  Math.round(contractRupees(p) * BUDGET_TO_CONTRACT * BUDGET_SHARE[category]);

/**
 * Spend relative to what the budget implies at the current progress.
 * >1 means over budget. Lagging projects overspend, which is realistic and shows up in charts.
 */
export const SPEND_FACTOR: Record<string, number> = {
  korba_road: 1.03,
  korba_hall: 0.96,
  korba_pipe: 1.14,
  csp_roads: 0.98,
  del_drain: 1.08,
  del_road: 0.99,
  mh_culvert: 1.01,
  mh_school: 1.12,
};

/** Rupees of cost incurred to date for a category: budget × progress × spend factor. */
export const actualRupees = (p: ProjectInfo, category: CategoryId): number =>
  Math.round(budgetRupees(p, category) * (p.actualPct / 100) * (SPEND_FACTOR[p.key] ?? 1));

export const monthsElapsed = (p: ProjectInfo): number =>
  Math.max(1, Math.round(daysBetween(p.startDate, DEMO_TODAY) / 30));

/** Splits `total` into `n` whole-rupee parts with ±`spread` variation; parts always sum exactly to `total`. */
export function splitRupees(total: number, n: number, jitter: () => number, spread = 0.25): number[] {
  if (n <= 1) return [total];
  const weights = Array.from({ length: n }, () => 1 + (jitter() * 2 - 1) * spread);
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.round((total * w) / sum));
  parts[n - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}
