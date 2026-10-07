// Integration: runs the real Prisma loaders against the dev/test database. Skipped unless APP_ENV is development/test
// and DATABASE_URL is set. Read-only.
import { PrismaClient, Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildSeedDatabase } from "@/lib/data/seed";
import { loadDatabaseForUser } from "@/lib/data/server/compose";
import type { Database } from "@/types";

const enabled = ["development", "test"].includes(process.env.APP_ENV ?? "") && !!process.env.DATABASE_URL;

/** Database key -> Prisma model, where the name is not simply the singular PascalCase of the key. */
const MODEL_OVERRIDES: Partial<Record<keyof Database, string>> = {
  dailyReports: "DailyWorkReport",
  progressSnapshots: "ProjectProgressSnapshot",
  workOrders: "SubcontractorWorkOrder",
  attendance: "Attendance",
  tenderStageHistory: "TenderStageHistory",
  approvalThresholds: "ApprovalThreshold",
};
/** Tables a user-scoped load legitimately returns fewer rows for, even as Director. */
const NOT_COMPARABLE = new Set<keyof Database>(["notifications", "auditLogs"]);

function modelFor(key: string): string | null {
  const known = new Set(Prisma.dmmf.datamodel.models.map((m) => m.name));
  if (MODEL_OVERRIDES[key as keyof Database]) return MODEL_OVERRIDES[key as keyof Database]!;
  const pascal = key.charAt(0).toUpperCase() + key.slice(1);
  const singular = pascal.endsWith("ies") ? pascal.slice(0, -3) + "y" : pascal.endsWith("s") ? pascal.slice(0, -1) : pascal;
  return [pascal, singular].find((c) => known.has(c)) ?? null;
}
const hasSoftDelete = (model: string) =>
  Prisma.dmmf.datamodel.models.find((m) => m.name === model)!.fields.some((f) => f.name === "deletedAt");

describe.runIf(enabled)("loadDatabaseForUser (real dev DB)", () => {
  // The Supabase session pooler has a small client cap; the loaders fan out in parallel, so keep the pool small.
  const url = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({ datasourceUrl: url + (url.includes("?") ? "&" : "?") + "connection_limit=4&pool_timeout=60" });
  const counts: Record<string, number> = {};
  let directorId = "";
  let adminId = "";
  let directorDb: Database;
  let adminDb: Database;

  beforeAll(async () => {
    const userWithRole = async (roleKey: string) => {
      const ur = await prisma.userRole.findFirst({ where: { deletedAt: null, role: { key: roleKey }, user: { isActive: true, deletedAt: null } } });
      if (!ur) throw new Error(`No active user with role ${roleKey}; run npm run db:reset`);
      return ur.userId;
    };
    directorId = await userWithRole("director");
    adminId = await userWithRole("system_admin");
    directorDb = (await loadDatabaseForUser(prisma, directorId)).db;
    adminDb = (await loadDatabaseForUser(prisma, adminId)).db;
    for (const key of Object.keys(directorDb)) {
      const model = modelFor(key);
      if (!model) continue;
      const delegate = (prisma as unknown as Record<string, { count(a?: object): Promise<number> }>)[model.charAt(0).toLowerCase() + model.slice(1)];
      counts[key] = await delegate.count(hasSoftDelete(model) ? { where: { deletedAt: null } } : undefined);
    }
  }, 120_000);
  afterAll(() => prisma.$disconnect());

  it("Director gets every live row of every table the loaders cover", () => {
    const mismatches: string[] = [];
    for (const [key, expected] of Object.entries(counts)) {
      if (NOT_COMPARABLE.has(key as keyof Database)) continue;
      const got = (directorDb[key as keyof Database] as unknown[]).length;
      if (got !== expected) mismatches.push(`${key}: loaded ${got}, DB ${expected}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("matches the deterministic seed for the seeded demo tables", () => {
    const seed = buildSeedDatabase();
    for (const key of ["tenders", "projects", "sites", "bids", "boqItems", "dailyReports", "employees", "parties"] as const) {
      expect(directorDb[key].length, key).toBe(seed[key].length);
    }
    expect(directorDb.tenders.length).toBeGreaterThan(0);
    expect(directorDb.projects.length).toBeGreaterThan(0);
  });

  it("System Admin (2-role version) also sees all rows", () => {
    for (const key of Object.keys(counts)) {
      if (NOT_COMPARABLE.has(key as keyof Database)) continue;
      expect((adminDb[key as keyof Database] as unknown[]).length, key).toBe((directorDb[key as keyof Database] as unknown[]).length);
    }
  });
});
