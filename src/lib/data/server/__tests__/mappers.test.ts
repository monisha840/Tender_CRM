import { describe, expect, it } from "vitest";
import type { Permission as PPermission, RolePermission as PRolePermission, Region as PRegion, GstRegistration as PGst } from "@prisma/client";
import { mapAction, mapPermission, mapRolePermission, mapScope, mapProjectMember } from "../load-access";
import { mapGstRegistration, mapRegion } from "../load-org";
import { base, isoDate } from "../convert";
import { buildLoadContext, emptyDatabase, mergeSlices } from "../compose";
import { getScope } from "../../access";
import type { Database } from "@/types";

const T = new Date("2026-01-02T03:04:05.000Z");
const audit = { createdAt: T, updatedAt: T, deletedAt: null, createdById: null, updatedById: null, version: 1 };

describe("scope mapping", () => {
  it.each([
    ["ALL", "ALL"],
    ["OWN_REGION", "OWN_REGION"],
    ["OWN_PROJECTS", "OWN_PROJECTS"],
    ["OWN_SITES", "OWN_SITES"],
    ["OWN_RECORDS", "OWN_RECORDS"],
  ] as const)("%s -> %s", (from, to) => expect(mapScope(from)).toBe(to));

  it("maps a role grant and keeps ids", () => {
    const row = { id: "rp1", roleId: "r", permissionId: "p", scope: "OWN_RECORDS", ...audit } as PRolePermission;
    expect(mapRolePermission(row)).toMatchObject({ id: "rp1", roleId: "r", permissionId: "p", scope: "OWN_RECORDS" });
  });
});

describe("action mapping", () => {
  it("maps every action losslessly", () => {
    expect(mapAction("APPROVE")).toBe("APPROVE");
    expect(mapAction("DELETE")).toBe("DELETE");
    expect(mapAction("REVIEW")).toBe("REVIEW");
    expect(mapPermission({ id: "p", module: "tenders", action: "DELETE", ...audit } as PPermission)).toMatchObject({ action: "DELETE" });
    expect(mapPermission({ id: "p", module: "tenders", action: "VIEW", ...audit } as PPermission)).toMatchObject({ module: "tenders", action: "VIEW" });
  });
});

describe("base / dates", () => {
  it("serialises timestamps and date-only values", () => {
    expect(base({ id: "x", ...audit })).toEqual({ id: "x", createdAt: T.toISOString(), updatedAt: T.toISOString(), deletedAt: null, version: 1 });
    expect(isoDate(new Date("2026-03-31T00:00:00.000Z"))).toBe("2026-03-31");
  });
  it("maps org rows with nullable dates", () => {
    const g = mapGstRegistration({
      id: "g", gstin: "22AAAAA0000A1Z5", legalName: "L", tradeName: null, stateId: "s", panNumber: "P", address: "A",
      validFrom: new Date("2025-04-01T00:00:00.000Z"), validTo: null, isActive: true, ...audit,
    } as PGst);
    expect(g.validFrom).toBe("2025-04-01");
    expect(g.validTo).toBeNull();
    expect(mapRegion({ id: "r", name: "N", code: "C", stateId: "s", isActive: true, ...audit } as PRegion)).toMatchObject({ code: "C", stateId: "s" });
  });
  it("maps project members dates", () => {
    const m = mapProjectMember({ id: "m", projectId: "p", employeeId: "e", roleLabel: "PM", fromDate: new Date("2026-01-05T00:00:00.000Z"), toDate: null, ...audit } as never);
    expect(m).toMatchObject({ fromDate: "2026-01-05", toDate: null });
  });
});

function fixture(): Database {
  const e = { createdAt: "", updatedAt: "" };
  return mergeSlices({
    regions: [
      { id: "r1", name: "A", code: "A", stateId: "s", isActive: true, ...e },
      { id: "r2", name: "B", code: "B", stateId: "s", isActive: true, ...e },
    ],
    users: [
      { id: "dir", name: "D", email: "d", isActive: true, ...e },
      { id: "pm", name: "P", email: "p", isActive: true, ...e },
    ],
    roles: [
      { id: "R_dir", key: "d", name: "D", description: "", isSystem: true, isActive: true, layout: "OFFICE", homePath: "/", ...e },
      { id: "R_pm", key: "p", name: "P", description: "", isSystem: true, isActive: true, layout: "OFFICE", homePath: "/", ...e },
    ],
    permissions: [{ id: "perm", module: "projects", action: "VIEW", ...e }],
    rolePermissions: [
      { id: "g1", roleId: "R_dir", permissionId: "perm", scope: "ALL", ...e },
      { id: "g2", roleId: "R_pm", permissionId: "perm", scope: "OWN_PROJECTS", ...e },
    ],
    userRoles: [
      { id: "u1", userId: "dir", roleId: "R_dir", ...e },
      { id: "u2", userId: "pm", roleId: "R_pm", ...e },
    ],
    userRegions: [{ id: "ur", userId: "pm", regionId: "r1", ...e }],
    employees: [{ id: "emp", code: "E", name: "P", homeRegionId: "r1", userId: "pm", ...e }],
    projectMembers: [{ id: "pmem", projectId: "p1", employeeId: "emp", roleLabel: "PM", fromDate: "2026-01-01", ...e }],
  });
}

describe("compose", () => {
  it("emptyDatabase has every table as an empty array", () => {
    const db = emptyDatabase();
    expect(db.tenders).toEqual([]);
    expect(db.auditLogs).toEqual([]);
    expect(Object.values(db).every((v) => Array.isArray(v))).toBe(true);
  });

  it("mergeSlices: later slice wins per table", () => {
    const a = { users: [{ id: "1" }] } as unknown as Partial<Database>;
    const b = { users: [{ id: "2" }] } as unknown as Partial<Database>;
    expect(mergeSlices(a, b).users.map((u) => u.id)).toEqual(["2"]);
  });

  it("director context is unrestricted", () => {
    const ctx = buildLoadContext(fixture(), "dir", []);
    expect(ctx).toMatchObject({ allowedRegionIds: null, ownProjectIds: null });
  });

  it("project manager context is narrowed to own regions and projects (members + managed)", () => {
    const db = fixture();
    const ctx = buildLoadContext(db, "pm", ["p2"]);
    expect(ctx.allowedRegionIds).toEqual(["r1"]);
    expect(ctx.ownProjectIds?.sort()).toEqual(["p1", "p2"]);
    expect(ctx.employeeId).toBe("emp");
    expect(getScope(db, "pm", "projects", "VIEW")).toBe("OWN_PROJECTS");
  });

  it("unknown user sees nothing", () => {
    expect(buildLoadContext(fixture(), "ghost", [])).toMatchObject({ allowedRegionIds: [], ownProjectIds: [] });
  });
});
