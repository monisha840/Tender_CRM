// Pure bid-pricing maths (no I/O, safe in the browser). All money is Decimal; inputs and outputs travel as strings.
import { Prisma } from "@prisma/client";

const D = (v: Prisma.Decimal.Value | null | undefined): Prisma.Decimal => {
  if (v === null || v === undefined || v === "") return new Prisma.Decimal(0);
  try {
    const d = new Prisma.Decimal(v);
    return d.isFinite() ? d : new Prisma.Decimal(0);
  } catch {
    return new Prisma.Decimal(0);
  }
};
const money = (d: Prisma.Decimal): string => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
const pct4 = (d: Prisma.Decimal): string => d.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4);

/** Working days in a month used to turn a monthly minimum wage into a daily one. */
export const WAGE_DAYS_PER_MONTH = 26;

export interface PricingInput {
  manpower: number;
  days: number;
  /** Statutory minimum wage per day (from StatutoryRate MIN_WAGE valid on the rate date). */
  minWagePerDay: Prisma.Decimal.Value;
  /** Wage we plan to pay per day; blank/0 means "the minimum wage". */
  dailyWage?: Prisma.Decimal.Value | null;
  pfPct: Prisma.Decimal.Value;
  esiPct: Prisma.Decimal.Value;
  bonusPct: Prisma.Decimal.Value;
  /** ESI only applies below the wage ceiling; turn it off for higher-paid trades. */
  esiApplicable?: boolean;
  overheadPct: Prisma.Decimal.Value;
  /** Target margin as a percentage of the price. */
  marginPct: Prisma.Decimal.Value;
  quotedPrice?: Prisma.Decimal.Value | null;
}

export type PricingWarningCode = "BELOW_COST" | "BELOW_STATUTORY" | "BELOW_TARGET_MARGIN" | "WAGE_BELOW_MINIMUM" | "MARGIN_BELOW_BENCHMARK";
export interface PricingWarning {
  code: PricingWarningCode;
  severity: "danger" | "warning";
  message: string;
}

export interface PricingResult {
  manDays: number;
  /** Daily wage actually used. */
  dailyWage: string;
  wageCost: string;
  pfCost: string;
  esiCost: string;
  bonusCost: string;
  /** Wages + employer contributions at the statutory minimum wage: the floor no bid may go under. */
  statutoryWageCost: string;
  directCost: string;
  overheadCost: string;
  totalCost: string;
  /** Price that earns the target margin: total cost / (1 - margin%). */
  minSafeBid: string;
  quotedPrice: string | null;
  marginAtQuote: string | null;
  marginPctAtQuote: string | null;
  warnings: PricingWarning[];
}

const inr = (d: Prisma.Decimal) => `₹${d.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP).toNumber().toLocaleString("en-IN")}`;

/** Employer on-cost (PF, ESI, bonus) on a wage bill. */
function onCosts(wage: Prisma.Decimal, i: Pick<PricingInput, "pfPct" | "esiPct" | "bonusPct" | "esiApplicable">) {
  const pf = wage.mul(D(i.pfPct)).div(100);
  const esi = i.esiApplicable === false ? new Prisma.Decimal(0) : wage.mul(D(i.esiPct)).div(100);
  const bonus = wage.mul(D(i.bonusPct)).div(100);
  return { pf, esi, bonus };
}

export function computePricing(input: PricingInput, benchmark?: { avgMarginPct: number | null } | null): PricingResult {
  const manDaysN = Math.max(0, Math.trunc(Number(input.manpower) || 0)) * Math.max(0, Math.trunc(Number(input.days) || 0));
  const manDays = new Prisma.Decimal(manDaysN);
  const minWage = D(input.minWagePerDay);
  const planned = D(input.dailyWage);
  const dailyWage = planned.gt(0) ? planned : minWage;

  const wage = manDays.mul(dailyWage);
  const { pf, esi, bonus } = onCosts(wage, input);
  const direct = wage.add(pf).add(esi).add(bonus);
  const overhead = direct.mul(D(input.overheadPct)).div(100);
  const total = direct.add(overhead);

  const statWage = manDays.mul(minWage);
  const stat = onCosts(statWage, input);
  const statutory = statWage.add(stat.pf).add(stat.esi).add(stat.bonus);

  const margin = D(input.marginPct);
  const keep = new Prisma.Decimal(1).sub(margin.div(100));
  const minSafe = keep.gt(0) ? total.div(keep) : total;

  const hasQuote = input.quotedPrice !== null && input.quotedPrice !== undefined && input.quotedPrice !== "" && D(input.quotedPrice).gt(0);
  const quote = hasQuote ? D(input.quotedPrice) : null;
  const marginAtQuote = quote ? quote.sub(total) : null;
  const marginPctAtQuote = quote && marginAtQuote ? marginAtQuote.div(quote).mul(100) : null;

  const warnings: PricingWarning[] = [];
  if (planned.gt(0) && planned.lt(minWage)) {
    warnings.push({ code: "WAGE_BELOW_MINIMUM", severity: "danger", message: `Planned wage ${inr(planned)}/day is below the statutory minimum ${inr(minWage)}/day.` });
  }
  if (quote) {
    if (quote.lt(statutory)) {
      warnings.push({ code: "BELOW_STATUTORY", severity: "danger", message: `Quoted price ${inr(quote)} is below the statutory wage cost ${inr(statutory)}.` });
    }
    if (quote.lt(total)) {
      warnings.push({ code: "BELOW_COST", severity: "danger", message: `Quoted price ${inr(quote)} is below total cost ${inr(total)}: a loss of ${inr(total.sub(quote))}.` });
    } else if (quote.lt(minSafe)) {
      warnings.push({ code: "BELOW_TARGET_MARGIN", severity: "warning", message: `Quoted price ${inr(quote)} is under the minimum safe bid ${inr(minSafe)} (target margin ${margin.toDecimalPlaces(1).toString()}%).` });
    }
    if (benchmark?.avgMarginPct != null && marginPctAtQuote && marginPctAtQuote.toNumber() < benchmark.avgMarginPct - 5) {
      warnings.push({ code: "MARGIN_BELOW_BENCHMARK", severity: "warning", message: `Margin at this price (${marginPctAtQuote.toDecimalPlaces(1)}%) is well under similar past projects (${benchmark.avgMarginPct.toFixed(1)}%).` });
    }
  }

  return {
    manDays: manDaysN,
    dailyWage: money(dailyWage),
    wageCost: money(wage),
    pfCost: money(pf),
    esiCost: money(esi),
    bonusCost: money(bonus),
    statutoryWageCost: money(statutory),
    directCost: money(direct),
    overheadCost: money(overhead),
    totalCost: money(total),
    minSafeBid: money(minSafe),
    quotedPrice: quote ? money(quote) : null,
    marginAtQuote: marginAtQuote ? money(marginAtQuote) : null,
    marginPctAtQuote: marginPctAtQuote ? pct4(marginPctAtQuote) : null,
    warnings,
  };
}

/** Normalises a MIN_WAGE rate row to rupees per day. */
export function dailyFromRate(value: Prisma.Decimal.Value, unit: string): string {
  const v = D(value);
  return money(unit === "AMOUNT_PER_MONTH" ? v.div(WAGE_DAYS_PER_MONTH) : v);
}

/** Average margin % across benchmark rows (ignores rows without a margin). */
export function averageMarginPct(rows: { marginPct: number | null }[]): number | null {
  const v = rows.map((r) => r.marginPct).filter((m): m is number => m !== null && Number.isFinite(m));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
