// Server-only: composes the per-domain Prisma loaders into one `Database` snapshot for a user.
//
// Design
//  1. Load the access + org slices first (small reference data, unscoped).
//  2. From them derive a `LoadContext`: which regions / projects this user may see (null = unrestricted).
//     This reuses the pure `getPersona` / `getAllowedRegionIds` so UI and server agree on "own region".
//  3. Run every other domain loader in parallel with that context. Loaders SHOULD narrow their queries
//     with it (region/project scope columns are denormalised on transactional tables) but a loader that
//     ignores it is still correct, only heavier. Authorisation is still enforced by server-side can().
//  4. Merge slices over an empty Database (every table key present), later registry entries win on duplicates.
//
// Loader contract: `(prisma, ctx) => Promise<Partial<Database>>`; a loader written as `(prisma)` also fits.
import type { PrismaClient } from "@prisma/client";
import type { Database, Id } from "@/types";
import { getAllowedRegionIds, getPersona } from "../access";
import { loadAccess, loadApprovalThresholds, type ApprovalThresholdRow } from "./load-access";
import { loadOrg } from "./load-org";
import { LIVE, type LoadScope } from "./convert";
import { loadTenderTables } from "./load-tenders";
import { loadProjectTables } from "./load-projects";
import { loadSiteTables } from "./load-sites";
import { loadParties } from "./load-parties";
import { loadApprovals } from "./load-approvals";
import { loadPlatform } from "./load-platform";
import { loadFinance } from "./load-finance";
import { loadWorkforce } from "./load-workforce";


export interface LoadContext {
  userId: Id;
  /** Region ids the user may see; null = every region. */
  allowedRegionIds: Id[] | null;
  /** Project ids the user may see via membership / project manager; null = every project. */
  ownProjectIds: Id[] | null;
  /** The employee record linked to this user, if any. */
  employeeId: Id | null;
}

export type Loader = (prisma: PrismaClient, ctx: LoadContext) => Promise<Partial<Database>>;

/** One slot per sibling loader module (src/lib/data/server/load-<name>.ts). */
export const LOADER_NAMES = ["tenders", "projects", "sites", "parties", "approvals", "platform", "finance", "workforce"] as const;
export type LoaderName = (typeof LOADER_NAMES)[number];
export type LoaderRegistry = Partial<Record<LoaderName, Loader>>;

/** Derive the query scope from the user context (null = unrestricted = no filter). */
export function scopeFromContext(ctx: LoadContext): LoadScope {
  return {
    ...(ctx.allowedRegionIds ? { regionIds: ctx.allowedRegionIds } : {}),
    ...(ctx.ownProjectIds ? { projectIds: ctx.ownProjectIds } : {}),
  };
}

const withScope =
  (fn: (prisma: PrismaClient, scope: LoadScope, ctx: LoadContext) => Promise<unknown>): Loader =>
  async (prisma, ctx) => (await fn(prisma, scopeFromContext(ctx), ctx)) as Partial<Database>;

/** All eight slots. Each receives the scope derived from the user context. */
export const DEFAULT_LOADERS: LoaderRegistry = {
  tenders: withScope(loadTenderTables),
  projects: withScope(loadProjectTables),
  sites: withScope(loadSiteTables),
  parties: withScope((p, scope) => loadParties(p, scope)),
  approvals: withScope(loadApprovals),
  platform: withScope((p, scope, ctx) => loadPlatform(p, scope, { userId: ctx.userId })),
  finance: withScope(loadFinance),
  workforce: withScope(loadWorkforce),
};

/** Every Database key, typed so a new table in `Database` fails compilation here until added. */
const EMPTY: { [K in keyof Database]: [] } = {
  states: [], regions: [], offices: [], serviceLines: [], gstRegistrations: [], regionGstRegistrations: [], organisations: [],
  users: [], roles: [], permissions: [], rolePermissions: [], userRoles: [], userRegions: [], employees: [], employeeProfiles: [],
  labourTypes: [], tenderStages: [], tenderResults: [], tenderTypes: [], tenderPortals: [], documentTypes: [], projectStatuses: [],
  expenseCategories: [], deductionTypes: [], materials: [], tenders: [], tenderStageHistory: [], goNoGoDecisions: [],
  tenderDocumentItems: [], securityInstruments: [], securityInstrumentEvents: [], bids: [], bidClarifications: [], competitorBids: [],
  tenderAwards: [], awardConditions: [], projects: [], projectConversions: [], projectMembers: [], progressSnapshots: [], sites: [],
  boqItems: [], dailyReports: [], dailyWorkItems: [], siteIssues: [], projectBudgetLines: [], costEntries: [], siteAssignments: [],
  attendance: [], payrollRuns: [], payslips: [], parties: [], subcontractors: [], vendors: [], workOrders: [], subcontractorBills: [],
  subcontractorBillDeductions: [], purchaseRequests: [], purchaseRequestItems: [], purchaseOrders: [], vendorInvoices: [],
  stockTransactions: [], invoices: [], invoiceDeductions: [], payments: [], retentionEntries: [], gstTransactions: [],
  approvalThresholds: [], approvalRequests: [], approvalSteps: [], approvalActions: [], documents: [], documentLinks: [], notifications: [], auditLogs: [],
};

export function emptyDatabase(): Database {
  return Object.fromEntries(Object.keys(EMPTY).map((k) => [k, []])) as unknown as Database;
}

/** Merge partial slices over an empty Database; later slices win per table. Pure. */
export function mergeSlices(...slices: Partial<Database>[]): Database {
  const db = emptyDatabase();
  // Only Database tables: loaders may return extra keys (flows, settings, ...) that are not part of the snapshot.
  for (const slice of slices) for (const k of Object.keys(slice)) if (k in db) (db as unknown as Record<string, unknown>)[k] = (slice as Record<string, unknown>)[k];
  return db;
}

/**
 * Pure: derive the scope context from the access/org slice.
 * `managedProjectIds` = projects whose projectManagerId is this user's employee (queried by the caller).
 */
export function buildLoadContext(db: Database, userId: Id, managedProjectIds: Id[]): LoadContext {
  const persona = getPersona(db, userId);
  if (!persona) return { userId, allowedRegionIds: [], ownProjectIds: [], employeeId: null };
  const employee = db.employees.find((e) => e.userId === userId) ?? null;
  const allRegions = db.regions.filter((r) => r.isActive).map((r) => r.id);
  const allowed = getAllowedRegionIds(db, userId);
  const unrestricted = db.rolePermissions.some((g) => g.roleId === persona.role.id && g.scope === "ALL");
  const memberOf = employee ? db.projectMembers.filter((m) => m.employeeId === employee.id).map((m) => m.projectId) : [];
  return {
    userId,
    allowedRegionIds: allowed.length === allRegions.length && unrestricted ? null : allowed,
    ownProjectIds: unrestricted ? null : [...new Set([...memberOf, ...managedProjectIds])],
    employeeId: employee?.id ?? null,
  };
}

export interface LoadedForUser {
  db: Database;
  ctx: LoadContext;
  /** Not a Database table: for server-side approval routing. */
  approvalThresholds: ApprovalThresholdRow[];
}

/** Read-only. Returns the user's `Database` snapshot so the pure `src/lib/data/*` functions work unchanged. */
export async function loadDatabaseForUser(
  prisma: PrismaClient,
  userId: Id,
  loaders: LoaderRegistry = DEFAULT_LOADERS,
): Promise<LoadedForUser> {
  const [org, access, approvalThresholds] = await Promise.all([loadOrg(prisma), loadAccess(prisma), loadApprovalThresholds(prisma)]);
  const base = mergeSlices(org, access);

  const employee = base.employees.find((e) => e.userId === userId);
  const managed = employee
    ? await prisma.project.findMany({ where: { ...LIVE, projectManagerId: employee.id }, select: { id: true } })
    : [];
  const ctx = buildLoadContext(base, userId, managed.map((p) => p.id));

  // Unknown / inactive user: return only reference data, no business rows.
  if (!getPersona(base, userId)) return { db: base, ctx, approvalThresholds };

  const run = LOADER_NAMES.map((n) => loaders[n]).filter((l): l is Loader => !!l);
  const slices = await Promise.all(run.map((load) => load(prisma, ctx)));
  return { db: mergeSlices(org, access, ...slices), ctx, approvalThresholds };
}
