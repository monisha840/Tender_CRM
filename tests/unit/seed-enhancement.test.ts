import { describe, expect, it } from "vitest";
import {
  buildCompanyDocuments, buildGrants, buildPermissions, buildReadinessChecks, buildSettings, buildStatutoryRates,
  checkKey, missingRows, permissionKey, previousPeriodMonth, rateKey, COMPANY_DOC_SPECS, resolveDocType,
} from "../../prisma/seed-enhancement";

const ASOF = new Date("2026-10-08T05:00:00Z");

describe("missingRows", () => {
  it("returns only absent keys and dedupes", () => {
    const rows = [{ k: "a" }, { k: "b" }, { k: "b" }, { k: "c" }];
    expect(missingRows(rows, ["a"], (r) => r.k).map((r) => r.k)).toEqual(["b", "c"]);
  });
  it("is idempotent: nothing missing once everything exists", () => {
    const rates = buildStatutoryRates();
    expect(missingRows(rates, rates.map(rateKey), rateKey)).toEqual([]);
    const perms = buildPermissions();
    expect(missingRows(perms, perms.map(permissionKey), permissionKey)).toEqual([]);
  });
});

describe("builders", () => {
  it("have unique deterministic ids", () => {
    for (const rows of [buildPermissions(), buildStatutoryRates(), buildSettings(), buildCompanyDocuments(ASOF), buildGrants()]) {
      expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    }
    expect(buildStatutoryRates()).toEqual(buildStatutoryRates());
  });
  it("min wage has two effective dates per category with an increase", () => {
    const mw = buildStatutoryRates().filter((r) => r.code === "MIN_WAGE");
    for (const cat of ["unskilled", "semi-skilled", "skilled"]) {
      const rows = mw.filter((r) => r.category === cat).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
      expect(rows).toHaveLength(2);
      expect(Number(rows[1].value)).toBeGreaterThan(Number(rows[0].value));
      expect(rows[0].sourceNote).toContain("demo/indicative");
    }
  });
  it("admin edits, director only views", () => {
    const g = buildGrants();
    expect(g.filter((x) => x.roleKey === "director").every((x) => x.action === "VIEW")).toBe(true);
    expect(g.some((x) => x.roleKey === "system_admin" && x.module === "bid_pricing" && x.action === "EDIT")).toBe(true);
  });
  it("settings include nine feature toggles and default thresholds", () => {
    const s = buildSettings();
    expect(s.filter((x) => /^features\..*\.enabled$/.test(x.key))).toHaveLength(9);
    expect(s.find((x) => x.key === "reminders.documentExpiryDays")?.value).toEqual([60, 30, 7]);
  });
  it("company documents: exactly one expired mandatory, two expiring soon", () => {
    const docs = buildCompanyDocuments(ASOF);
    const expired = docs.filter((d) => d.expiryDate && d.expiryDate < ASOF);
    expect(expired.map((d) => d.specKey)).toEqual(["labour_licence"]);
    expect(COMPANY_DOC_SPECS.find((s) => s.key === "labour_licence")?.checklistMandatory).toBe(true);
    expect(expired[0].notes).toContain("SUBMITTED-BLOCK");
    const soon = docs.filter((d) => d.expiryDate && d.expiryDate > ASOF && d.expiryDate <= new Date("2026-11-08"));
    expect(soon).toHaveLength(2);
  });
  it("reuses existing document types by alias", () => {
    const spec = COMPANY_DOC_SPECS.find((s) => s.key === "labour_licence")!;
    expect(resolveDocType(spec, [{ id: "x", name: "contract labour licence" }])).toBe("x");
    expect(resolveDocType(spec, [])).toBeNull();
  });
  it("readiness: first project Ready, second Blocked, previous month", () => {
    expect(previousPeriodMonth(new Date("2026-01-15T00:00:00Z"))).toBe("2025-12");
    const checks = buildReadinessChecks(["p1", "p2"], ASOF);
    expect(checks.every((c) => c.periodMonth === "2026-09")).toBe(true);
    expect(checks.filter((c) => c.projectId === "p1").every((c) => c.isDone)).toBe(true);
    expect(checks.filter((c) => c.projectId === "p2").some((c) => !c.isDone)).toBe(true);
    expect(new Set(checks.map(checkKey)).size).toBe(checks.length);
    expect(buildReadinessChecks(["only"], ASOF)).toHaveLength(6);
  });
});
