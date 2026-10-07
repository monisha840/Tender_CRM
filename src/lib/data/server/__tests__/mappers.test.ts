import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildSeedDatabase } from "../../seed";
import { day, money, pct, qty, ts } from "../convert";
import { mapAward, mapBid, mapInstrument, mapTender } from "../load-tenders";
import { mapBoqItem, mapProgress, mapProject } from "../load-projects";
import { mapDailyItem, mapDailyReport, mapSite } from "../load-sites";

const db = buildSeedDatabase();

// Reverse of the mappers: seed (string) row -> what Prisma would return (Date / Decimal).
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function asPrismaRow<T extends object>(seed: T, decimals: string[]): never {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(seed)) {
    if (decimals.includes(k) && typeof v === "string") out[k] = new Prisma.Decimal(v);
    else if (typeof v === "string" && (DAY_RE.test(v) || TS_RE.test(v))) out[k] = new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v);
    else out[k] = v ?? null;
  }
  return out as never;
}
/** Drop null/undefined so a seed row that omits an optional field equals the mapper's explicit null. */
const nn = (o: object) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null));

describe("conversion helpers", () => {
  it("formats Decimal to the fixed string forms", () => {
    expect(money(new Prisma.Decimal("23100000"))).toBe("23100000.00");
    expect(qty(new Prisma.Decimal("12.5"))).toBe("12.500");
    expect(pct(new Prisma.Decimal("-3.75"))).toBe("-3.7500");
  });
  it("formats dates", () => {
    expect(day(new Date("2026-03-04T00:00:00.000Z"))).toBe("2026-03-04");
    expect(ts(new Date("2026-03-04T09:30:00Z"))).toBe("2026-03-04T09:30:00.000Z");
  });
});

describe("Prisma row -> Database row round-trip against the seed", () => {
  it("tenders", () => {
    for (const t of db.tenders.slice(0, 3)) {
      const row = asPrismaRow(t, ["estimatedValue", "emdAmount", "tenderFee"]);
      expect(nn(mapTender(row))).toEqual(nn(t));
    }
  });
  it("security instruments", () => {
    for (const i of db.securityInstruments.slice(0, 3)) {
      expect(nn(mapInstrument(asPrismaRow(i, ["amount"])))).toEqual(nn(i));
    }
  });
  it("bids and awards", () => {
    const bid = db.bids[0];
    expect(nn(mapBid(asPrismaRow(bid, ["quotedAmount", "percentVsEstimate"])))).toEqual(nn(bid));
    const award = db.tenderAwards[0];
    expect(nn(mapAward(asPrismaRow(award, ["awardedAmount"])))).toEqual(nn(award));
  });
  it("projects, BOQ and progress", () => {
    for (const p of db.projects.slice(0, 3)) {
      expect(nn(mapProject(asPrismaRow(p, ["contractValue"])))).toEqual(nn(p));
    }
    const boq = db.boqItems[0];
    expect(nn(mapBoqItem(asPrismaRow(boq, ["quantity", "rate", "amount", "executedQty"])))).toEqual(nn(boq));
    const ps = db.progressSnapshots[0];
    expect(nn(mapProgress(asPrismaRow(ps, ["plannedPct", "actualPct"])))).toEqual(nn(ps));
  });
  it("sites, daily reports and items", () => {
    expect(nn(mapSite(asPrismaRow(db.sites[0], [])))).toEqual(nn(db.sites[0]));
    for (const r of db.dailyReports.slice(0, 3)) expect(nn(mapDailyReport(asPrismaRow(r, [])))).toEqual(nn(r));
    const it0 = db.dailyWorkItems[0];
    expect(nn(mapDailyItem(asPrismaRow(it0, ["plannedQty", "completedQty"])))).toEqual(nn(it0));
  });
  it("keeps soft-deleted rows flagged (readers filter with live())", () => {
    const t = { ...(asPrismaRow(db.tenders[0], ["estimatedValue", "emdAmount", "tenderFee"]) as Record<string, unknown>) };
    t.deletedAt = new Date("2026-02-01T00:00:00.000Z");
    expect(mapTender(t as never).deletedAt).toBe("2026-02-01T00:00:00.000Z");
  });
});
