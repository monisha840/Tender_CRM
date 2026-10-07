// Server-only: the fast path that feeds the app shell with REAL data.
//
// Why a second composer next to compose.ts: the dev/prod database is remote (about 230 ms per round trip), so what
// matters is the number of sequential round trips and the volume of rows. This path
//   * loads ONE unscoped snapshot in a single parallel round (org, access, tenders, projects, sites, parties,
//     approvals, masters; plus workforce/finance only when the PHASE67 flag is on),
//   * skips daily reports, attendance, payroll, GST/finance tables, notifications and audit logs otherwise,
//   * is identical for every unrestricted user (both roles in the minimal version), so it can be cached once and
//     shared (see server-db.ts),
//   * falls back to the scoped `loadDatabaseForUser` for any user that is region/project restricted.
import type { PrismaClient } from "@prisma/client";
import type { Database, Id, Site } from "@/types";
import { getPersona } from "../access";
import { buildLoadContext, loadDatabaseForUser, mergeSlices, type LoadedForUser } from "./compose";
import { LIVE, STABLE_ORDER } from "./convert";
import { loadAccess } from "./load-access";
import { loadApprovals } from "./load-approvals";
import { loadFinance } from "./load-finance";
import { loadOrg } from "./load-org";
import { loadParties } from "./load-parties";
import { loadPlatform } from "./load-platform";
import { loadProjectTables } from "./load-projects";
import { loadSiteTables, mapSite } from "./load-sites";
import { loadTenderTables } from "./load-tenders";
import { loadWorkforce } from "./load-workforce";

export interface SnapshotOptions {
  /** Include Employees/Payroll, GST/Finance and daily-work tables (the PHASE67 flag). */
  phase67: boolean;
}

/** One unscoped, flag-aware snapshot, loaded in a single parallel round. */
export async function loadSharedSnapshot(prisma: PrismaClient, { phase67 }: SnapshotOptions): Promise<Database> {
  const sites = phase67
    ? loadSiteTables(prisma)
    : prisma.site.findMany({ where: LIVE, orderBy: STABLE_ORDER }).then((rows): { sites: Site[] } => ({ sites: rows.map(mapSite) }));
  const slices = await Promise.all([
    loadOrg(prisma),
    loadAccess(prisma),
    loadTenderTables(prisma),
    loadProjectTables(prisma),
    sites,
    loadParties(prisma),
    loadApprovals(prisma),
    loadPlatform(prisma, undefined, { lean: true }),
    ...(phase67 ? [loadFinance(prisma), loadWorkforce(prisma)] : []),
  ]);
  return mergeSlices(...(slices as Partial<Database>[]));
}

/** Only the reference tables a restricted/unknown user may see before any business rows. */
const pick = <K extends keyof Database>(db: Database, keys: K[]): Partial<Database> =>
  Object.fromEntries(keys.map((k) => [k, db[k]])) as Partial<Database>;

/**
 * The Database for a signed-in user. `shared` may be a cached snapshot. Unrestricted users get it as is; a user
 * without a persona gets only org + access reference data; a restricted user is re-loaded with the scoped loaders.
 */
export async function loadDatabaseLean(
  prisma: PrismaClient,
  userId: Id,
  options: SnapshotOptions,
  shared?: Database,
): Promise<LoadedForUser> {
  const db = shared ?? (await loadSharedSnapshot(prisma, options));
  const ctx = buildLoadContext(db, userId, []);
  if (!getPersona(db, userId)) {
    const ref = mergeSlices(
      pick(db, ["states", "regions", "offices", "serviceLines", "gstRegistrations", "regionGstRegistrations", "organisations"]),
      pick(db, ["users", "roles", "permissions", "rolePermissions", "userRoles", "userRegions", "employees", "projectMembers"]),
    );
    return { db: ref, ctx, approvalThresholds: [] };
  }
  if (ctx.allowedRegionIds !== null || ctx.ownProjectIds !== null) return loadDatabaseForUser(prisma, userId);
  return { db, ctx, approvalThresholds: db.approvalThresholds.map((t) => ({ ...t })) };
}
