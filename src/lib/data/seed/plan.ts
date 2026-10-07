import { daysBetween, DEMO_TODAY } from "@/lib/dates";
import { toPaise } from "@/lib/money";
import type { ProjectInfo } from "./projects";
import { WORK_ORDERS, woCategory } from "./workorders";

export type CategoryId = "ec_materials" | "ec_subcontract" | "ec_labour" | "ec_equipment" | "ec_overheads";

/** Budget split by expense category per BOQ template; each row sums to 1. */
const SHARES: Record<ProjectInfo["template"], Record<CategoryId, number>> = {
  stone: { ec_materials: 0.04, ec_subcontract: 0.02, ec_labour: 0.7, ec_equipment: 0.06, ec_overheads: 0.18 },
  paint: { ec_materials: 0.3, ec_subcontract: 0.3, ec_labour: 0.22, ec_equipment: 0.1, ec_overheads: 0.08 },
  cbp: { ec_materials: 0.4, ec_subcontract: 0.33, ec_labour: 0.1, ec_equipment: 0.1, ec_overheads: 0.07 },
  steel: { ec_materials: 0.4, ec_subcontract: 0.28, ec_labour: 0.12, ec_equipment: 0.12, ec_overheads: 0.08 },
  civil: { ec_materials: 0.3, ec_subcontract: 0.35, ec_labour: 0.15, ec_equipment: 0.1, ec_overheads: 0.1 },
  scaff: { ec_materials: 0.15, ec_subcontract: 0.45, ec_labour: 0.2, ec_equipment: 0.1, ec_overheads: 0.1 },
  package: { ec_materials: 0.14, ec_subcontract: 0.46, ec_labour: 0.24, ec_equipment: 0.08, ec_overheads: 0.08 },
};

/** Total planned cost is 88% of contract value (12% planned margin). */
export const BUDGET_TO_CONTRACT = 0.88;

export const contractRupees = (p: ProjectInfo): number => Number(toPaise(p.contractValue)) / 100;

/** Subcontract commitments for a project in a category (so budgets always cover the work orders). */
const woTotal = (projectKey: string, category: CategoryId): number =>
  WORK_ORDERS.filter((w) => w.project === projectKey && woCategory(w.trade) === category).reduce((a, w) => a + w.valueRupees, 0);

export const budgetRupees = (p: ProjectInfo, category: CategoryId): number => {
  const base = contractRupees(p) * BUDGET_TO_CONTRACT * SHARES[p.template][category];
  return Math.round(Math.max(base, woTotal(p.key, category) * 1.02));
};

export const CATEGORIES: CategoryId[] = ["ec_materials", "ec_subcontract", "ec_labour", "ec_equipment", "ec_overheads"];

/**
 * Spend relative to what the budget implies at the current progress.
 * >1 means over budget. Lagging projects overspend, which is realistic and shows up in charts.
 */
export const SPEND_FACTOR: Record<string, number> = {
  p1_ntpc_stone: 1.02,
  p2_cspgcl_paint: 1.13,
  p3_mspgcl_cbp: 1.06,
  p4_mspgcl_stone: 0.99,
  p5_tangedco_scaff: 1.05,
  p6_ntpc_steel: 1.12,
  p7_mppgcl_civil: 0.98,
  p8_nalco_paint: 0.97,
  p9_dvc_stone: 1.01,
  p10_kpcl_pkg: 1.02,
};

/** Rupees of cost incurred to date for a category: budget × progress × spend factor. */
export const actualRupees = (p: ProjectInfo, category: CategoryId): number =>
  Math.round(budgetRupees(p, category) * (p.actualPct / 100) * (SPEND_FACTOR[p.key] ?? 1));

/** Months of activity so far (a completed project stops at its end date). */
export const monthsElapsed = (p: ProjectInfo): number =>
  Math.max(1, Math.round(daysBetween(p.startDate, p.endDate < DEMO_TODAY ? p.endDate : DEMO_TODAY) / 30));

/** Splits `total` into `n` whole-rupee parts with ±`spread` variation; parts always sum exactly to `total`. */
export function splitRupees(total: number, n: number, jitter: () => number, spread = 0.25): number[] {
  if (n <= 1) return [total];
  const weights = Array.from({ length: n }, () => 1 + (jitter() * 2 - 1) * spread);
  const sum = weights.reduce((a, b) => a + b, 0);
  const parts = weights.map((w) => Math.round((total * w) / sum));
  parts[n - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
}
