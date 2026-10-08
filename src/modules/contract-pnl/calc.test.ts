import { describe, expect, it } from "vitest";
import { allocateByWeights, averageMoney, averagePct, buildPnl, isOtherCostSource, marginOf, mergeMonthly, parseLowMarginPct, pnlFlag } from "./calc";

describe("marginOf", () => {
  it("computes margin and percent of billed", () => {
    expect(marginOf("1000000.00", "800000.00")).toEqual({ margin: "200000.00", pct: 20 });
    expect(marginOf("300.00", "100.00")).toEqual({ margin: "200.00", pct: 66.67 });
  });
  it("goes negative on a loss", () => {
    expect(marginOf("1000.00", "1250.00")).toEqual({ margin: "-250.00", pct: -25 });
  });
  it("has no percent when nothing is billed", () => {
    expect(marginOf("0.00", "500.00")).toEqual({ margin: "-500.00", pct: null });
  });
});

describe("pnlFlag", () => {
  it("flags loss, low and healthy against the threshold", () => {
    expect(pnlFlag("-1.00", -0.1, 10)).toBe("LOSS");
    expect(pnlFlag("50.00", 5, 10)).toBe("LOW");
    expect(pnlFlag("100.00", 10, 10)).toBe("OK");
    expect(pnlFlag("0.00", null, 10)).toBe("NO_BILLING");
    expect(pnlFlag("-5.00", null, 10)).toBe("LOSS");
  });
  it("reads the setting safely", () => {
    expect(parseLowMarginPct(15)).toBe(15);
    expect(parseLowMarginPct("x")).toBe(10);
    expect(parseLowMarginPct(250)).toBe(10);
  });
});

describe("allocateByWeights", () => {
  it("splits to the paisa with no loss", () => {
    const m = allocateByWeights("100.00", [{ key: "a", weight: 1 }, { key: "b", weight: 1 }, { key: "c", weight: 1 }]);
    expect([...m.values()].sort()).toEqual(["33.33", "33.33", "33.34"]);
  });
  it("weights by days and ignores zero weights", () => {
    const m = allocateByWeights("1000.00", [{ key: "a", weight: 15 }, { key: "b", weight: 5 }, { key: "z", weight: 0 }]);
    expect(m.get("a")).toBe("750.00");
    expect(m.get("b")).toBe("250.00");
    expect(m.has("z")).toBe(false);
  });
  it("returns nothing without weights", () => {
    expect(allocateByWeights("10.00", []).size).toBe(0);
  });
});

describe("buildPnl", () => {
  const facts = {
    billed: [{ month: "2026-08", amount: "1000000.00" }, { month: "2026-09", amount: "500000.00" }],
    received: [{ month: "2026-08", amount: "1000000.00" }],
    subCost: [{ month: "2026-08", amount: "300000.00" }],
    labourCost: [{ month: "2026-08", amount: "400000.00" }, { month: "2026-09", amount: "350000.00" }],
    otherCost: [{ month: "2026-09", amount: "50000.00" }],
  };
  it("sums revenue and the three cost heads", () => {
    const p = buildPnl(facts, 10);
    expect(p.billed).toBe("1500000.00");
    expect(p.totalCost).toBe("1100000.00");
    expect(p.margin).toBe("400000.00");
    expect(p.marginPct).toBe(26.67);
    expect(p.cashMargin).toBe("-100000.00");
    expect(p.flag).toBe("OK");
    expect(p.monthly.map((m) => [m.month, m.margin])).toEqual([["2026-08", "300000.00"], ["2026-09", "100000.00"]]);
  });
  it("flags a low-margin and a loss-making contract", () => {
    expect(buildPnl({ ...facts, otherCost: [{ month: "2026-09", amount: "400000.00" }] }, 10).flag).toBe("LOW");
    expect(buildPnl({ ...facts, otherCost: [{ month: "2026-09", amount: "700000.00" }] }, 10).flag).toBe("LOSS");
  });
  it("merges monthly series", () => {
    const a = buildPnl(facts).monthly;
    const merged = mergeMonthly([a, a]);
    expect(merged[0].billed).toBe("2000000.00");
  });
});

describe("misc", () => {
  it("does not double count cost entries that mirror bills or payroll", () => {
    expect(isOtherCostSource("SubcontractorBill")).toBe(false);
    expect(isOtherCostSource("PAYROLL_RUN")).toBe(false);
    expect(isOtherCostSource("VendorInvoice")).toBe(true);
    expect(isOtherCostSource("MANUAL")).toBe(true);
  });
  it("averages", () => {
    expect(averageMoney(["100.00", "250.00"])).toBe("175.00");
    expect(averageMoney([])).toBe("0.00");
    expect(averagePct([10, null, 20])).toBe(15);
    expect(averagePct([null])).toBeNull();
  });
});
