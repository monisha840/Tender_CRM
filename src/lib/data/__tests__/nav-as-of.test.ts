import { describe, expect, it } from "vitest";
import { dbAsOf } from "../as-of";
import { buildSeedDatabase } from "../seed";

const db = buildSeedDatabase();

describe("dbAsOf (as-of date picker)", () => {
  it("hides invoices, reports and attendance dated after the day", () => {
    const view = dbAsOf(db, "2026-08-31");
    expect(view.invoices.length).toBeLessThan(db.invoices.length);
    expect(view.invoices.every((i) => i.invoiceDate <= "2026-08-31")).toBe(true);
    expect(view.dailyReports.every((r) => r.reportDate <= "2026-08-31")).toBe(true);
    expect(view.attendance.every((a) => a.date <= "2026-08-31")).toBe(true);
  });
  it("shows what had been received by then, not today's balance", () => {
    const view = dbAsOf(db, "2026-08-31");
    const paidNow = db.invoices.filter((i) => i.paymentStatus === "PAID" && i.invoiceDate <= "2026-08-31");
    const then = paidNow.map((i) => view.invoices.find((v) => v.id === i.id)!);
    expect(then.some((v) => v.paymentStatus !== "PAID")).toBe(true);
  });
  it("puts a tender back in the stage it had on that day", () => {
    const view = dbAsOf(db, "2026-08-31");
    const changed = view.tenders.filter((t) => db.tenders.find((x) => x.id === t.id)!.currentStageId !== t.currentStageId);
    expect(changed.length).toBeGreaterThan(0);
    changed.forEach((t) => {
      const last = view.tenderStageHistory
        .filter((h) => h.tenderId === t.id)
        .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
        .at(-1);
      expect(t.currentStageId).toBe(last?.toStageId);
    });
  });
  it("changes nothing on the latest day", () => {
    const view = dbAsOf(db, "2026-10-07");
    expect(view.invoices).toHaveLength(db.invoices.length);
    expect(view.dailyReports).toHaveLength(db.dailyReports.length);
  });
});
