// Integration (read-only): the fast server snapshot that feeds the shell, against the dev DB.
// Skipped unless APP_ENV is development/test and DATABASE_URL is set.
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDashboard, getPersona, listProjects, listSubcontractors, listTenders } from "@/lib/data";
import { matchDbUserId } from "@/lib/auth/persona-map";
import { loadDatabaseLean } from "@/lib/data/server/snapshot";
import type { Database } from "@/types";

const enabled = ["development", "test"].includes(process.env.APP_ENV ?? "") && !!process.env.DATABASE_URL;

describe.runIf(enabled)("loadDatabaseLean (real dev DB)", () => {
  const url = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({ datasourceUrl: url + (url.includes("?") ? "&" : "?") + "connection_limit=6&pool_timeout=60" });
  let off: Database;
  let on: Database;
  let directorId = "";
  let adminId = "";

  beforeAll(async () => {
    const userWithRole = async (roleKey: string) => {
      const ur = await prisma.userRole.findFirst({ where: { deletedAt: null, role: { key: roleKey }, user: { isActive: true, deletedAt: null } } });
      if (!ur) throw new Error(`No active user with role ${roleKey}`);
      return ur.userId;
    };
    directorId = await userWithRole("director");
    adminId = await userWithRole("system_admin");
    off = (await loadDatabaseLean(prisma, directorId, { phase67: false })).db;
    on = (await loadDatabaseLean(prisma, adminId, { phase67: true })).db;
  }, 120_000);
  afterAll(() => prisma.$disconnect());

  it("loads the in-scope tables and matches the database row counts", async () => {
    expect(off.tenders.length).toBe(await prisma.tender.count({ where: { deletedAt: null } }));
    expect(off.projects.length).toBe(await prisma.project.count({ where: { deletedAt: null } }));
    expect(off.subcontractors.length).toBe(await prisma.subcontractor.count({ where: { deletedAt: null } }));
    expect(off.sites.length).toBe(await prisma.site.count({ where: { deletedAt: null } }));
  });

  it("skips the heavy phase 6/7 tables when the flag is off, and loads them when on", () => {
    for (const k of ["dailyReports", "dailyWorkItems", "siteIssues", "attendance", "payslips", "payrollRuns", "invoices", "gstTransactions", "notifications", "auditLogs"] as const) {
      expect(off[k], k).toHaveLength(0);
    }
    expect(on.attendance.length + on.invoices.length).toBeGreaterThan(0);
    expect(on.notifications).toHaveLength(0);
    expect(on.auditLogs).toHaveLength(0);
  });

  it("leaves no table empty that has rows in the database (with the flag on)", async () => {
    const overrides: Record<string, string> = { dailyReports: "DailyWorkReport", progressSnapshots: "ProjectProgressSnapshot", workOrders: "SubcontractorWorkOrder", attendance: "Attendance", tenderStageHistory: "TenderStageHistory", approvalThresholds: "ApprovalThreshold" };
    const models = new Map(Prisma.dmmf.datamodel.models.map((m) => [m.name, m]));
    const modelFor = (key: string) => {
      if (overrides[key]) return overrides[key];
      const pascal = key.charAt(0).toUpperCase() + key.slice(1);
      const singular = pascal.endsWith("ies") ? pascal.slice(0, -3) + "y" : pascal.endsWith("s") ? pascal.slice(0, -1) : pascal;
      return [pascal, singular].find((c) => models.has(c));
    };
    const missing: string[] = [];
    for (const [key, rows] of Object.entries(on)) {
      if ((rows as unknown[]).length > 0 || key === "notifications" || key === "auditLogs") continue;
      const model = modelFor(key);
      if (!model) continue;
      const delegate = (prisma as unknown as Record<string, { count: (a?: unknown) => Promise<number> }>)[model.charAt(0).toLowerCase() + model.slice(1)];
      const where = models.get(model)!.fields.some((f) => f.name === "deletedAt") ? { deletedAt: null } : undefined;
      if ((await delegate.count({ where })) > 0) missing.push(key);
    }
    expect(missing).toEqual([]);
  }, 60_000);

  it("resolves a persona for the Director and the Admin from the real rows", () => {
    expect(getPersona(off, directorId)?.role.key).toBe("director");
    expect(getPersona(on, adminId)?.role.key).toBe("system_admin");
    const u = off.users.find((x) => x.id === directorId)!;
    expect(matchDbUserId(off, { id: directorId, email: "zzz@zzz.zz" })).toBe(directorId);
    expect(matchDbUserId(off, { id: "unknown", email: u.email.toUpperCase() })).toBe(directorId);
  });

  it("the pure dashboard and list functions work on the lean snapshot", () => {
    const d = getDashboard(off, "ALL");
    expect(d.activeTenders.count).toBe(listTenders(off, { region: "ALL" }).filter((r) => r.stage.kind !== "WON" && r.stage.kind !== "LOST").length);
    expect(listProjects(off, "ALL").length).toBe(off.projects.filter((p) => !p.deletedAt).length);
    expect(listSubcontractors(off, "ALL").length).toBeGreaterThan(0);
  });

  it("returns only reference data for a user without a persona", async () => {
    const { db } = await loadDatabaseLean(prisma, "no-such-user", { phase67: false }, off);
    expect(db.tenders).toHaveLength(0);
    expect(db.users.length).toBeGreaterThan(0);
  });
});
