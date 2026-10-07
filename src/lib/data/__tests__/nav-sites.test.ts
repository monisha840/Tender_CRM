import { describe, expect, it } from "vitest";
import { buildSeedDatabase } from "../seed";
import { countAttendanceNotMarked, getMissingReports, reportCutoffPassed } from "../sites";

const db = buildSeedDatabase();
const TODAY = "2026-10-07"; // a Wednesday

describe("reportCutoffPassed (B23)", () => {
  const site = { reportCutoffTime: "18:00" };
  it("is not yet missing before the site cutoff today", () => expect(reportCutoffPassed(site, TODAY, TODAY, "10:00")).toBe(false));
  it("is missing at and after the cutoff today", () => {
    expect(reportCutoffPassed(site, TODAY, TODAY, "18:00")).toBe(true);
    expect(reportCutoffPassed(site, TODAY, TODAY, "23:59")).toBe(true);
  });
  it("past days are always past cutoff, future days never", () => {
    expect(reportCutoffPassed(site, "2026-10-06", TODAY, "00:01")).toBe(true);
    expect(reportCutoffPassed(site, "2026-10-08", TODAY, "23:59")).toBe(false);
  });
});

describe("getMissingReports (B23)", () => {
  it("flags nothing in the morning, whatever is outstanding", () => {
    expect(getMissingReports(db, TODAY, "ALL", "09:00")).toHaveLength(0);
  });
  it("only flags sites whose own cutoff has passed", () => {
    const flagged = getMissingReports(db, TODAY, "ALL", "17:45");
    expect(flagged.every((m) => m.site.reportCutoffTime <= "17:45")).toBe(true);
    const late = getMissingReports(db, TODAY, "ALL", "23:00");
    expect(late.length).toBeGreaterThanOrEqual(flagged.length);
  });
  it("skips Sundays", () => expect(getMissingReports(db, "2026-10-04", "ALL", "23:00")).toHaveLength(0));
});

describe("countAttendanceNotMarked (B23)", () => {
  const date = TODAY;
  const clear = { ...db, attendance: db.attendance.filter((a) => a.date !== date) };
  const active = clear.siteAssignments.filter((a) => a.fromDate <= date && (!a.toDate || a.toDate >= date));
  const people = [...new Set(active.map((a) => a.employeeId))];

  it("counts employees, not assignments", () => {
    expect(countAttendanceNotMarked(clear, date)).toBe(people.length);
    expect(active.length).toBeGreaterThanOrEqual(people.length);
  });
  it("treats an all-HOLIDAY day like a week-off", () => {
    const row = { ...db.attendance[0], id: "h1", employeeId: people[0], date, status: "HOLIDAY" as const };
    expect(countAttendanceNotMarked({ ...clear, attendance: [row] }, date)).toBe(0);
  });
  it("does not count someone who has been marked present", () => {
    const row = { ...db.attendance[0], id: "m1", employeeId: people[0], date, status: "PRESENT" as const };
    expect(countAttendanceNotMarked({ ...clear, attendance: [row] }, date)).toBe(people.length - 1);
  });
});
