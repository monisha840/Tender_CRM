import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { averageMarginPct, computePricing, dailyFromRate, type PricingInput } from "../calc";
import { readToggle } from "../feature";
import { loadPricingRates } from "../service";

const base: PricingInput = {
  manpower: 20, days: 365, minWagePerDay: "500", dailyWage: null,
  pfPct: 12, esiPct: 3.25, bonusPct: 8.33, esiApplicable: true, overheadPct: 10, marginPct: 10, quotedPrice: null,
};

describe("pricing maths", () => {
  it("builds cost from man-days, wage, PF/ESI/bonus and overheads", () => {
    const r = computePricing(base);
    // 20 x 365 = 7,300 man-days x 500 = 36,50,000 wages
    expect(r.manDays).toBe(7300);
    expect(r.wageCost).toBe("3650000.00");
    expect(r.pfCost).toBe("438000.00");
    expect(r.esiCost).toBe("118625.00");
    expect(r.bonusCost).toBe("304045.00");
    expect(r.directCost).toBe("4510670.00");
    expect(r.overheadCost).toBe("451067.00");
    expect(r.totalCost).toBe("4961737.00");
    // minimum safe bid = cost / (1 - 10%)
    expect(r.minSafeBid).toBe("5513041.11");
    expect(r.statutoryWageCost).toBe("4510670.00");
  });

  it("uses a planned wage above the minimum, and keeps the statutory floor at the minimum", () => {
    const r = computePricing({ ...base, dailyWage: "600" });
    expect(r.dailyWage).toBe("600.00");
    expect(r.wageCost).toBe("4380000.00");
    expect(r.statutoryWageCost).toBe("4510670.00");
    expect(Number(r.totalCost)).toBeGreaterThan(4961737);
  });

  it("skips ESI when it does not apply", () => {
    const r = computePricing({ ...base, esiApplicable: false });
    expect(r.esiCost).toBe("0.00");
  });

  it("gives margin at the quoted price", () => {
    const r = computePricing({ ...base, quotedPrice: "6000000" });
    expect(r.marginAtQuote).toBe("1038263.00");
    expect(Number(r.marginPctAtQuote)).toBeCloseTo(17.3044, 3);
    expect(r.warnings).toEqual([]);
  });

  it("warns when the quote is below the minimum safe bid but above cost", () => {
    const r = computePricing({ ...base, quotedPrice: "5200000" });
    expect(r.warnings.map((w) => w.code)).toEqual(["BELOW_TARGET_MARGIN"]);
  });

  it("warns when the quote is below total cost", () => {
    const r = computePricing({ ...base, quotedPrice: "4800000" });
    expect(r.warnings.map((w) => w.code)).toEqual(["BELOW_COST"]);
    expect(r.marginAtQuote).toBe("-161737.00");
  });

  it("warns on both counts when the quote is under the statutory wage cost", () => {
    const r = computePricing({ ...base, quotedPrice: "3000000" });
    expect(r.warnings.map((w) => w.code).sort()).toEqual(["BELOW_COST", "BELOW_STATUTORY"]);
    expect(r.warnings.every((w) => w.severity === "danger")).toBe(true);
  });

  it("warns when the planned wage is under the legal minimum", () => {
    const r = computePricing({ ...base, dailyWage: "450" });
    expect(r.warnings.map((w) => w.code)).toContain("WAGE_BELOW_MINIMUM");
  });

  it("warns when margin is well under similar past projects", () => {
    const r = computePricing({ ...base, quotedPrice: "5600000" }, { avgMarginPct: 25 });
    expect(r.warnings.map((w) => w.code)).toContain("MARGIN_BELOW_BENCHMARK");
    expect(computePricing({ ...base, quotedPrice: "5600000" }, { avgMarginPct: null }).warnings).toEqual([]);
  });

  it("is safe on blank and nonsense inputs", () => {
    const r = computePricing({ ...base, manpower: 0, days: Number.NaN, quotedPrice: "" });
    expect(r.totalCost).toBe("0.00");
    expect(r.quotedPrice).toBeNull();
  });

  it("converts monthly minimum wages to a daily figure and averages benchmark margins", () => {
    expect(dailyFromRate("13000", "AMOUNT_PER_MONTH")).toBe("500.00");
    expect(dailyFromRate("517.5", "AMOUNT_PER_DAY")).toBe("517.50");
    expect(averageMarginPct([{ marginPct: 10 }, { marginPct: 20 }, { marginPct: null }])).toBe(15);
    expect(averageMarginPct([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Rate-by-date: the statutory rate in force ON the tender's date is used, not today's.
// ---------------------------------------------------------------------------

type Row = { code: string; value: number; unit: string; effectiveFrom: string; category: string | null; regionId: string | null; sourceNote: string | null };
const ROWS: Row[] = [
  { code: "MIN_WAGE", value: 450, unit: "AMOUNT_PER_DAY", effectiveFrom: "2025-04-01", category: null, regionId: null, sourceNote: "Old notification" },
  { code: "MIN_WAGE", value: 500, unit: "AMOUNT_PER_DAY", effectiveFrom: "2026-04-01", category: null, regionId: null, sourceNote: "FY26-27" },
  { code: "MIN_WAGE", value: 14300, unit: "AMOUNT_PER_MONTH", effectiveFrom: "2026-04-01", category: "SKILLED", regionId: "r1", sourceNote: "Skilled, CG" },
  { code: "PF_EMPLOYER", value: 12, unit: "PERCENT", effectiveFrom: "2020-01-01", category: null, regionId: null, sourceNote: null },
  { code: "ESI_EMPLOYER", value: 3.25, unit: "PERCENT", effectiveFrom: "2020-01-01", category: null, regionId: null, sourceNote: null },
  { code: "BONUS", value: 8.33, unit: "PERCENT", effectiveFrom: "2020-01-01", category: null, regionId: null, sourceNote: null },
];
const fakeDb = {
  statutoryRate: {
    findMany: async ({ where }: { where: { code: string; effectiveFrom: { lte: Date } } }) =>
      ROWS.filter((r) => r.code === where.code && new Date(`${r.effectiveFrom}T00:00:00Z`) <= where.effectiveFrom.lte)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
        .map((r) => ({ ...r, value: new Prisma.Decimal(r.value), effectiveFrom: new Date(`${r.effectiveFrom}T00:00:00Z`) })),
  },
  setting: {},
} as unknown as Parameters<typeof loadPricingRates>[2];

describe("statutory rates by date", () => {
  it("uses the minimum wage in force on the date, not the latest", async () => {
    const before = await loadPricingRates(new Date("2026-03-31T00:00:00Z"), {}, fakeDb);
    const after = await loadPricingRates(new Date("2026-04-01T00:00:00Z"), {}, fakeDb);
    expect(before.minWage?.perDay).toBe("450.00");
    expect(before.minWage?.sourceNote).toBe("Old notification");
    expect(after.minWage?.perDay).toBe("500.00");
    expect(after.minWage?.effectiveFrom).toBe("2026-04-01");
  });

  it("prefers the category and region row and converts a monthly rate to a daily one", async () => {
    const r = await loadPricingRates(new Date("2026-06-01T00:00:00Z"), { category: "SKILLED", regionId: "r1" }, fakeDb);
    expect(r.minWage?.perDay).toBe("550.00");
    const general = await loadPricingRates(new Date("2026-06-01T00:00:00Z"), { category: "SKILLED", regionId: "other" }, fakeDb);
    expect(general.minWage?.perDay).toBe("500.00");
  });

  it("returns PF / ESI / bonus percentages and null when nothing is in force yet", async () => {
    const r = await loadPricingRates(new Date("2026-06-01T00:00:00Z"), {}, fakeDb);
    expect([r.pf?.value, r.esi?.value, r.bonus?.value]).toEqual(["12", "3.25", "8.33"]);
    const none = await loadPricingRates(new Date("2019-01-01T00:00:00Z"), {}, fakeDb);
    expect(none.minWage).toBeNull();
    expect(none.pf).toBeNull();
  });
});

describe("feature toggle values", () => {
  it("reads booleans, strings and { enabled }", () => {
    expect(readToggle(false)).toBe(false);
    expect(readToggle("true")).toBe(true);
    expect(readToggle({ enabled: false })).toBe(false);
    expect(readToggle(null)).toBeNull();
    expect(readToggle(42)).toBeNull();
  });
});
