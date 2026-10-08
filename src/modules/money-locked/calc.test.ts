import { describe, expect, it } from "vitest";
import {
  ageingBucket,
  ageingTotals,
  countsAsLocked,
  daysLocked,
  daysToExpiry,
  deriveLockedStatus,
  expiryAlert,
  lastMonths,
  lockedSeries,
  monthEnd,
  parseExpiryThresholds,
  retentionBalance,
  totalsByClient,
} from "./calc";

describe("deriveLockedStatus", () => {
  it("is locked for open instruments", () => {
    expect(deriveLockedStatus("SUBMITTED")).toBe("LOCKED");
    expect(deriveLockedStatus("ARRANGED", "ISSUED")).toBe("LOCKED");
    expect(deriveLockedStatus("EXPIRED", "EXTENDED")).toBe("LOCKED");
  });
  it("shows an open refund request", () => {
    expect(deriveLockedStatus("SUBMITTED", "REFUND_REQUESTED")).toBe("REFUND_REQUESTED");
  });
  it("closing status or event wins over a refund request", () => {
    expect(deriveLockedStatus("REFUNDED", "REFUND_REQUESTED")).toBe("RELEASED");
    expect(deriveLockedStatus("SUBMITTED", "RELEASED")).toBe("RELEASED");
    expect(deriveLockedStatus("ADJUSTED")).toBe("RELEASED");
    expect(deriveLockedStatus("FORFEITED", "REFUND_REQUESTED")).toBe("FORFEITED");
    expect(deriveLockedStatus("SUBMITTED", "FORFEITED")).toBe("FORFEITED");
  });
  it("leaves an unissued ARRANGED instrument off the ledger", () => {
    expect(countsAsLocked("ARRANGED", null)).toBe(false);
    expect(countsAsLocked("ARRANGED", "2026-01-01")).toBe(true);
    expect(countsAsLocked("SUBMITTED", null)).toBe(true);
  });
});

describe("days locked / to expiry", () => {
  it("counts whole days and never goes negative", () => {
    expect(daysLocked("2026-09-01", "2026-10-01")).toBe(30);
    expect(daysLocked("2026-10-05", "2026-10-01")).toBe(0);
    expect(daysLocked(null, "2026-10-01")).toBeNull();
  });
  it("is negative once expired", () => {
    expect(daysToExpiry("2026-10-10", "2026-10-08")).toBe(2);
    expect(daysToExpiry("2026-10-01", "2026-10-08")).toBe(-7);
    expect(daysToExpiry(null, "2026-10-08")).toBeNull();
  });
});

describe("expiryAlert", () => {
  it("picks the tightest band", () => {
    expect(expiryAlert(40)).toBeNull();
    expect(expiryAlert(30)).toEqual({ level: "soon", threshold: 30 });
    expect(expiryAlert(12)).toEqual({ level: "soon", threshold: 15 });
    expect(expiryAlert(7)).toEqual({ level: "soon", threshold: 7 });
    expect(expiryAlert(0)).toEqual({ level: "soon", threshold: 7 });
    expect(expiryAlert(-1)).toEqual({ level: "expired", threshold: null });
    expect(expiryAlert(null)).toBeNull();
  });
  it("honours custom thresholds and validates the setting", () => {
    expect(expiryAlert(50, [60])).toEqual({ level: "soon", threshold: 60 });
    expect(parseExpiryThresholds([7, 30, 15])).toEqual([30, 15, 7]);
    expect(parseExpiryThresholds("x")).toEqual([30, 15, 7]);
    expect(parseExpiryThresholds([])).toEqual([30, 15, 7]);
    expect(parseExpiryThresholds([0, -3, "a"])).toEqual([30, 15, 7]);
  });
});

describe("ageing", () => {
  it("buckets days", () => {
    expect(ageingBucket(0)).toBe("0-30");
    expect(ageingBucket(30)).toBe("0-30");
    expect(ageingBucket(31)).toBe("31-90");
    expect(ageingBucket(180)).toBe("91-180");
    expect(ageingBucket(181)).toBe("181-365");
    expect(ageingBucket(366)).toBe("365+");
    expect(ageingBucket(null)).toBeNull();
  });
  it("totals per bucket", () => {
    const t = ageingTotals([
      { amount: "100.50", days: 10 },
      { amount: "200.00", days: 20 },
      { amount: "50.00", days: 400 },
      { amount: "999.00", days: null },
    ]);
    expect(t["0-30"]).toBe("300.50");
    expect(t["365+"]).toBe("50.00");
    expect(t["31-90"]).toBe("0.00");
  });
});

describe("series and totals", () => {
  it("month helpers", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(monthEnd("2026-12")).toBe("2026-12-31");
    expect(lastMonths("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
  it("locks from issue until release and nets retention releases", () => {
    const s = lockedSeries(
      [
        { amount: "1000.00", from: "2026-01-15", to: "2026-03-10" },
        { amount: "500.00", from: "2026-02-01", to: null },
        { amount: "-200.00", from: "2026-03-05", to: null },
      ],
      ["2026-01", "2026-02", "2026-03", "2026-04"],
    );
    expect(s.map((x) => x.total)).toEqual(["1000.00", "1500.00", "300.00", "300.00"]);
  });
  it("retention balance never goes below zero", () => {
    expect(retentionBalance([{ type: "WITHHELD", amount: "100.00" }, { type: "RELEASED", amount: "40.00" }])).toBe("60.00");
    expect(retentionBalance([{ type: "RELEASED", amount: "40.00" }])).toBe("0.00");
  });
  it("totals open items per client, largest first", () => {
    const t = totalsByClient([
      { clientId: "a", clientName: "A", amount: "100.00", status: "LOCKED", expiryDate: "2026-12-01" },
      { clientId: "a", clientName: "A", amount: "50.00", status: "REFUND_REQUESTED", expiryDate: "2026-11-01" },
      { clientId: "a", clientName: "A", amount: "999.00", status: "RELEASED", expiryDate: null },
      { clientId: "b", clientName: "B", amount: "500.00", status: "LOCKED", expiryDate: null },
    ]);
    expect(t.map((x) => [x.clientId, x.total, x.count, x.nextExpiry])).toEqual([
      ["b", "500.00", 1, null],
      ["a", "150.00", 2, "2026-11-01"],
    ]);
  });
});
