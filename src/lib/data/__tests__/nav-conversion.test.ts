import { describe, expect, it } from "vitest";
import { buildSeedDatabase } from "../seed";
import { buildConversion, checkConversion, defaultGstRegistrationId, defaultProjectManagerId, getTender, uniqueProjectCode, type TenderDetail } from "../tenders";

const db = buildSeedDatabase();

function wonUnconverted(): TenderDetail {
  for (const t of db.tenders) {
    const d = getTender(db, t.id);
    if (d && d.stage.kind === "WON" && !d.projectId) return d;
  }
  throw new Error("seed has no unconverted won tender");
}

describe("uniqueProjectCode (B16)", () => {
  it("never reuses a code, even when the count would collide", () => {
    const withGap = { ...db, projects: [{ ...db.projects[0], code: "SPH-CHH-07" }] };
    expect(uniqueProjectCode(withGap, "CHH")).toBe("SPH-CHH-08");
  });
  it("counts soft-deleted projects as taken", () => {
    const p = { ...db.projects[0], code: "SPH-ZZ-01", deletedAt: "2026-01-01T00:00:00.000Z" };
    expect(uniqueProjectCode({ ...db, projects: [p] }, "ZZ")).toBe("SPH-ZZ-02");
  });
  it("starts at 01 for a new region", () => expect(uniqueProjectCode({ ...db, projects: [] }, "XX")).toBe("SPH-XX-01"));
});

describe("buildConversion (B16)", () => {
  it("fills the GSTIN from the region when the tender has none, and sets a manager", () => {
    const d = wonUnconverted();
    const bare: TenderDetail = { ...d, tender: { ...d.tender, gstRegistrationId: null } };
    expect(checkConversion(db, bare).ok).toBe(true);
    const { project } = buildConversion(db, bare, "usr_stalin", null);
    expect(project.gstRegistrationId).not.toBe("");
    expect(project.gstRegistrationId).toBe(defaultGstRegistrationId(db, bare.tender));
    expect(project.projectManagerId).toBe(defaultProjectManagerId(db, bare.tender.regionId));
  });
  it("gives a second conversion a different code once the first is saved", () => {
    const d = wonUnconverted();
    const first = buildConversion(db, d, "usr_stalin", null).project;
    const second = buildConversion({ ...db, projects: [...db.projects, first] }, d, "usr_stalin", null).project;
    expect(second.code).not.toBe(first.code);
  });
  it("blocks conversion when the region has no GSTIN", () => {
    const d = wonUnconverted();
    const bare: TenderDetail = { ...d, tender: { ...d.tender, gstRegistrationId: null } };
    expect(checkConversion({ ...db, regionGstRegistrations: [] }, bare).ok).toBe(false);
  });
});
