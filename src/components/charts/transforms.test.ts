import { describe, expect, it } from "vitest";
import { ageingSegments, buildFunnel, clampPct, daysLeftLabel, deadlineHeat, deadlineTone, heatLevel, overdueShare, toSegments, treemapItems } from "./transforms";

const stages = [
  { stageId: "a", stage: "New", count: 4, value: 400 },
  { stageId: "b", stage: "Under Evaluation", count: 3, value: 300 },
  { stageId: "c", stage: "Bid Preparing", count: 2, value: 200 },
  { stageId: "d", stage: "Submitted", count: 1, value: 100 },
];

describe("buildFunnel", () => {
  const f = buildFunnel(stages, { label: "Won", count: 1, value: 50 });
  it("accumulates tenders that reached each stage or beyond", () => {
    expect(f.map((s) => s.reachedCount)).toEqual([11, 7, 4, 2, 1]);
    expect(f.map((s) => s.reachedValue)).toEqual([1050, 650, 350, 150, 50]);
  });
  it("computes conversion between consecutive stages", () => {
    expect(f[0].conversionPct).toBeNull();
    expect(f[1].conversionPct).toBeCloseTo((7 / 11) * 100);
    expect(f[4].conversionPct).toBeCloseTo(50);
    expect(f[4].isWon).toBe(true);
  });
  it("scales widths against the first stage and keeps non-empty stages visible", () => {
    expect(f[0].widthPct).toBe(100);
    const tiny = buildFunnel([{ stageId: "a", stage: "A", count: 1000, value: 0 }], { label: "Won", count: 1, value: 0 });
    expect(tiny[1].widthPct).toBe(14);
  });
  it("handles an empty pipeline without NaN", () => {
    const e = buildFunnel(stages.map((s) => ({ ...s, count: 0, value: 0 })), { label: "Won", count: 0, value: 0 });
    expect(e.every((s) => s.conversionPct === null && s.widthPct === 0)).toBe(true);
  });
});

describe("segments and ageing", () => {
  it("returns shares that sum to 100", () => {
    const s = ageingSegments([
      { bucket: "0-30", amount: 50, count: 2 },
      { bucket: "31-60", amount: 30, count: 1 },
      { bucket: "61-90", amount: 10, count: 1 },
      { bucket: "90+", amount: 10, count: 1 },
    ]);
    expect(s.map((x) => x.pct)).toEqual([50, 30, 10, 10]);
  });
  it("is all zero for an empty total", () => {
    expect(toSegments([{ key: "a", label: "A", amount: 0 }])[0].pct).toBe(0);
  });
  it("overdueShare excludes the first bucket", () => {
    expect(overdueShare([{ amount: 60 }, { amount: 40 }])).toBe(40);
    expect(overdueShare([])).toBe(0);
  });
});

describe("deadline helpers", () => {
  it("builds a 30-day strip across a month end", () => {
    const h = deadlineHeat("2026-01-30", 30, [
      { date: "2026-02-02", title: "T1" },
      { date: "2026-02-02", title: "T2" },
    ]);
    expect(h).toHaveLength(30);
    expect(h[0].date).toBe("2026-01-30");
    expect(h[3]).toMatchObject({ date: "2026-02-02", count: 2 });
    expect(h[29].date).toBe("2026-02-28");
  });
  it("labels and tones days left", () => {
    expect(daysLeftLabel(0)).toBe("Today");
    expect(daysLeftLabel(5)).toBe("in 5 days");
    expect(daysLeftLabel(-1)).toBe("1 day overdue");
    expect(deadlineTone(1)).toBe("danger");
    expect(deadlineTone(6)).toBe("warning");
    expect(deadlineTone(20)).toBe("neutral");
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(5)).toBe(3);
  });
});

describe("misc", () => {
  it("clamps percentages", () => {
    expect(clampPct(140)).toBe(100);
    expect(clampPct(-3)).toBe(0);
    expect(clampPct(null)).toBe(0);
  });
  it("folds a long treemap tail into Other", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ name: `S${i}`, value: 10 - i }));
    const t = treemapItems(items, 4);
    expect(t).toHaveLength(4);
    expect(t[3]).toEqual({ name: "Other", value: 7 + 6 + 5 + 4 + 3 + 2 + 1 });
  });
});
