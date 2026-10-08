import { describe, expect, it } from "vitest";
import { isPeriodMonth, readinessStatus, type ReadinessItem } from "../readiness";

const item = (label: string, isDone: boolean, isMandatory = true): ReadinessItem => ({ code: label.toUpperCase(), label, isMandatory, isDone });

describe("readinessStatus", () => {
  it("is ready when every mandatory item is done", () => {
    const r = readinessStatus([item("Wage register", true), item("PF challan", true)]);
    expect(r).toMatchObject({ ready: true, missing: [], label: "Ready to submit", done: 2, total: 2 });
  });
  it("is blocked and names what is missing", () => {
    const r = readinessStatus([item("Wage register", true), item("PF challan", false), item("ESI challan", false)]);
    expect(r.ready).toBe(false);
    expect(r.label).toBe("Blocked: missing PF challan, ESI challan");
  });
  it("optional items never block", () => {
    expect(readinessStatus([item("Wage register", true), item("Extra", false, false)]).ready).toBe(true);
  });
  it("the derived gate item blocks like any mandatory item", () => {
    const r = readinessStatus([item("Wage register", true), item("Gate attendance reconciled", false)]);
    expect(r.label).toBe("Blocked: missing Gate attendance reconciled");
  });
  it("an empty checklist is not ready", () => {
    expect(readinessStatus([])).toMatchObject({ ready: false, label: "Checklist not set up" });
  });
});

describe("isPeriodMonth", () => {
  it("accepts YYYY-MM only", () => {
    expect(isPeriodMonth("2026-10")).toBe(true);
    expect(isPeriodMonth("2026-13")).toBe(false);
    expect(isPeriodMonth("2026-1")).toBe(false);
  });
});
