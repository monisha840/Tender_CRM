// Pure contract P&L rules (no DB, no server-only): margin, flags, labour allocation, monthly trend.
import { addMoney, fromPaise, subMoney, toPaise } from "@/lib/money";
import type { Money } from "@/types";

export const DEFAULT_LOW_MARGIN_PCT = 10;

export type PnlFlag = "LOSS" | "LOW" | "OK" | "NO_BILLING";

export const FLAG_LABEL: Record<PnlFlag, string> = {
  LOSS: "Loss-making",
  LOW: "Low margin",
  OK: "Healthy",
  NO_BILLING: "Not billed yet",
};

const ZERO = BigInt(0);

/** Margin = billed - cost; pct = margin / billed (rounded to 2 decimals), null when nothing is billed. */
export function marginOf(billed: Money, cost: Money): { margin: Money; pct: number | null } {
  const margin = subMoney(billed, cost);
  const b = toPaise(billed);
  if (b <= ZERO) return { margin, pct: null };
  // basis points of billed, half away from zero
  const num = toPaise(margin) * BigInt(10000);
  const half = b / BigInt(2);
  const bp = num >= ZERO ? (num + half) / b : (num - half) / b;
  return { margin, pct: Number(bp) / 100 };
}

/** Loss when the margin is negative; low when below `threshold` percent; no-billing when pct is unknown and cost is nil. */
export function pnlFlag(margin: Money, pct: number | null, threshold: number = DEFAULT_LOW_MARGIN_PCT): PnlFlag {
  const m = toPaise(margin);
  if (m < ZERO) return "LOSS";
  if (pct === null) return "NO_BILLING";
  return pct < threshold ? "LOW" : "OK";
}

/** Reads the Setting value pnl.lowMarginPct; anything not a number in 0..100 falls back to the default. */
export function parseLowMarginPct(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : DEFAULT_LOW_MARGIN_PCT;
}

/**
 * Splits `amount` across keys in proportion to `weights` (largest-remainder, so the parts always add up to the
 * amount to the paisa). Keys with a zero or negative weight get nothing; no positive weight returns an empty map.
 */
export function allocateByWeights(amount: Money, weights: { key: string; weight: number }[]): Map<string, Money> {
  const w = weights.filter((x) => x.weight > 0);
  const out = new Map<string, Money>();
  const total = w.reduce((s, x) => s + x.weight, 0);
  if (!w.length || total <= 0) return out;
  const paise = toPaise(amount);
  const SCALE = BigInt(1_000_000);
  const scaled = w.map((x) => BigInt(Math.round((x.weight / total) * 1_000_000)));
  const scaledSum = scaled.reduce((s, x) => s + x, ZERO) || SCALE;
  const shares = scaled.map((s) => (paise * s) / scaledSum);
  let left = paise - shares.reduce((s, x) => s + x, ZERO);
  const order = scaled.map((s, i) => ({ i, rem: (paise * s) % scaledSum })).sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  const step = left >= ZERO ? BigInt(1) : BigInt(-1);
  for (let k = 0; left !== ZERO; k = (k + 1) % order.length) {
    shares[order[k].i] += step;
    left -= step;
  }
  w.forEach((x, i) => out.set(x.key, fromPaise(shares[i])));
  return out;
}

// ---------------------------------------------------------------------------
// Aggregation of dated facts into a project P&L
// ---------------------------------------------------------------------------

export interface DatedAmount {
  /** "YYYY-MM" */
  month: string;
  amount: Money;
}

export interface ProjectFacts {
  billed: DatedAmount[];
  received: DatedAmount[];
  subCost: DatedAmount[];
  labourCost: DatedAmount[];
  otherCost: DatedAmount[];
}

export interface PnlMonth {
  month: string;
  billed: Money;
  cost: Money;
  margin: Money;
}

export interface Pnl {
  billed: Money;
  received: Money;
  subCost: Money;
  labourCost: Money;
  otherCost: Money;
  totalCost: Money;
  margin: Money;
  marginPct: number | null;
  /** Cash view: received - cost. */
  cashMargin: Money;
  flag: PnlFlag;
  monthly: PnlMonth[];
}

const total = (xs: DatedAmount[]): Money => xs.reduce((s, x) => addMoney(s, x.amount), "0.00");

/** SourceTypes on CostEntry that duplicate data counted elsewhere (sub bills, payroll) and must not be added twice. */
const DUPLICATE_SOURCE = /subcontract|sub[_\s-]?bill|payroll|payslip|salary|wage/i;
export const isOtherCostSource = (sourceType: string): boolean => !DUPLICATE_SOURCE.test(sourceType);

export function buildPnl(f: ProjectFacts, lowMarginPct: number = DEFAULT_LOW_MARGIN_PCT): Pnl {
  const billed = total(f.billed);
  const subCost = total(f.subCost);
  const labourCost = total(f.labourCost);
  const otherCost = total(f.otherCost);
  const totalCost = addMoney(addMoney(subCost, labourCost), otherCost);
  const { margin, pct } = marginOf(billed, totalCost);

  const byMonth = new Map<string, { billed: Money; cost: Money }>();
  const bump = (m: string, key: "billed" | "cost", amt: Money) => {
    const cur = byMonth.get(m) ?? { billed: "0.00", cost: "0.00" };
    cur[key] = addMoney(cur[key], amt);
    byMonth.set(m, cur);
  };
  f.billed.forEach((x) => bump(x.month, "billed", x.amount));
  [...f.subCost, ...f.labourCost, ...f.otherCost].forEach((x) => bump(x.month, "cost", x.amount));
  const monthly = [...byMonth.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, v]) => ({ month, billed: v.billed, cost: v.cost, margin: subMoney(v.billed, v.cost) }));

  const received = total(f.received);
  return {
    billed,
    received,
    subCost,
    labourCost,
    otherCost,
    totalCost,
    margin,
    marginPct: pct,
    cashMargin: subMoney(received, totalCost),
    flag: pnlFlag(margin, pct, lowMarginPct),
    monthly,
  };
}

/** Sums monthly series of several projects (portfolio trend). */
export function mergeMonthly(series: PnlMonth[][]): PnlMonth[] {
  const map = new Map<string, { billed: Money; cost: Money }>();
  for (const s of series)
    for (const m of s) {
      const cur = map.get(m.month) ?? { billed: "0.00", cost: "0.00" };
      cur.billed = addMoney(cur.billed, m.billed);
      cur.cost = addMoney(cur.cost, m.cost);
      map.set(m.month, cur);
    }
  return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([month, v]) => ({ month, billed: v.billed, cost: v.cost, margin: subMoney(v.billed, v.cost) }));
}

/** Average of money values (rounded half away from zero to the paisa); "0.00" for an empty list. */
export function averageMoney(values: Money[]): Money {
  if (!values.length) return "0.00";
  const n = BigInt(values.length);
  const sum = values.reduce((s, v) => s + toPaise(v), ZERO);
  const half = n / BigInt(2);
  return fromPaise(sum >= ZERO ? (sum + half) / n : (sum - half) / n);
}

/** Average of margin percentages, ignoring projects that are not billed; null if none. Rounded to 2 decimals. */
export function averagePct(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null);
  return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 100) / 100 : null;
}
