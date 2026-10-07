/**
 * Base seed: the real masters every environment needs (dev, test, production).
 * Regions, GSTINs, the two roles (system_admin, director) and their permission matrix, approval flows (one Director
 * step each, no thresholds: docs/progress.md "Scope change"), tender stages and the other configurable masters.
 *
 * Idempotent: every row is upserted by id, so it is safe to run repeatedly.
 * No demo data, no users (users are created by the System Admin through Supabase Auth in S2).
 *
 * Run (not yet run; waiting for the schema checkpoint):
 *   npx dotenv -e .env.local -- npx tsx prisma/seed-base.ts
 *
 * NOTE: GSTINs below are PLACEHOLDERS derived from the company PAN with a valid checksum.
 * Replace them with the registered GSTINs before real use (Settings > GSTINs, or edit here).
 */
import { assertNotProductionDb } from "../scripts/prod-guard";
import { PrismaClient, type PermissionAction, type PermissionScope } from "@prisma/client";
import { makeGstin } from "../src/lib/gst-validation";
import { DEDUCTION_TYPES, DOC_TYPES, docTypeId, EXPENSE_CATEGORIES, SERVICE_LINES, STAGE_DEFS, stageId, TENDER_TYPES, tenderTypeId } from "../src/lib/data/seed/masters";
import { COMPANY, STATES } from "../src/lib/data/seed/org";
import { RegionKey, StateOf, type RegionKeyName } from "../src/lib/data/seed/helpers";

type Upserter = {
  upsert(args: { where: { id: string }; update: object; create: object }): Promise<unknown>;
};

async function upsertAll<T extends { id: string }>(delegate: unknown, rows: readonly T[]) {
  const d = delegate as Upserter;
  for (const row of rows) {
    const { id, ...data } = row;
    await d.upsert({ where: { id }, update: data, create: row });
  }
}

// ---------------------------------------------------------------------------
// Roles and the permission matrix (go-live-plan 2.2). Roles are data: the System Admin can edit them.
// ---------------------------------------------------------------------------

/** Permission modules. Finer than the nav modules so the matrix rows map one to one. */
export const MODULES = [
  "dashboard",
  "tenders",
  "tender_go_no_go",
  "instruments",
  "tender_conversion",
  "projects",
  "subcontractors",
  "sub_work_orders",
  "sub_bills",
  "sub_payments",
  "daily_reports",
  "approvals",
  "notifications",
  "audit_log",
  "settings",
  "users",
  "gst_invoices", // Phase 2
  "payroll", // Phase 3
] as const;
type Mod = (typeof MODULES)[number];

const ACTIONS: PermissionAction[] = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "REJECT", "SUBMIT", "REVIEW", "ASSIGN_WORK", "MANAGE_FINANCE"];

// Matrix letters: V view, C create, E edit, D soft-delete, A approve (always together with REJECT).
const V: PermissionAction[] = ["VIEW"];
const VA: PermissionAction[] = ["VIEW", "APPROVE", "REJECT"];
const VCED: PermissionAction[] = ["VIEW", "CREATE", "EDIT", "DELETE"];

type Grants = Partial<Record<Mod, readonly [PermissionAction[], PermissionScope]>>;

interface RoleSpec {
  key: string;
  name: string;
  description: string;
  homePath: string;
  grants: Grants;
}

const ALL: PermissionScope = "ALL";
const OWN: PermissionScope = "OWN_RECORDS";

// Minimal 2-role scope (docs/progress.md "Scope change"): the Admin enters data and submits, the Director views
// everything and approves. No region/project scoping, so every grant is ALL (notifications: own). Feature-flagged
// modules (daily_reports, gst_invoices, payroll, ...) get the same two-role shape so enabling them needs no seed change.
const ADMIN_FULL: PermissionAction[] = ["VIEW", "CREATE", "EDIT", "DELETE", "SUBMIT"];

const BUSINESS_MODULES: Mod[] = [
  "tenders", "tender_go_no_go", "instruments", "tender_conversion", "projects", "subcontractors",
  "sub_work_orders", "sub_bills", "sub_payments", "daily_reports", "gst_invoices", "payroll",
];

const businessGrants = (actions: PermissionAction[]): Grants =>
  Object.fromEntries(BUSINESS_MODULES.map((m) => [m, [actions, ALL] as const]));

export const ROLE_SPECS: RoleSpec[] = [
  {
    key: "system_admin",
    name: "System Admin",
    description: "Enters and maintains data, manages users, settings and masters, and submits items for approval. Cannot approve.",
    homePath: "/dashboard",
    grants: {
      dashboard: [V, ALL],
      ...businessGrants(ADMIN_FULL),
      approvals: [["VIEW", "SUBMIT"], ALL],
      notifications: [V, OWN],
      audit_log: [V, ALL],
      settings: [VCED, ALL],
      users: [VCED, ALL],
    },
  },
  {
    key: "director",
    name: "Director",
    description: "Views everything across all regions and is the single approver for every approval request.",
    homePath: "/dashboard",
    grants: {
      dashboard: [V, ALL],
      ...businessGrants(VA),
      approvals: [VA, ALL],
      notifications: [V, OWN],
      audit_log: [V, ALL],
      settings: [V, ALL],
      users: [V, ALL],
    },
  },
];

export const roleId = (key: string) => `role_${key}`;
export const permissionId = (module: string, action: string) => `perm_${module}_${action}`;

// ---------------------------------------------------------------------------
// Approval flows and thresholds (go-live-plan 2.3). Routing: first level whose role threshold covers the amount.
// ---------------------------------------------------------------------------

// Every flow is ONE step to the Director (no thresholds, no regional routing). The levels/thresholds tables stay
// so multi-level routing can be switched on later without a schema change.
const FLOWS = [
  { key: "GO_NO_GO", name: "Tender GO / NO-GO", entityType: "Tender" },
  { key: "TENDER_CONVERSION", name: "Convert tender to project", entityType: "Tender" },
  { key: "WORK_ORDER", name: "Subcontractor work order", entityType: "SubcontractorWorkOrder" },
  { key: "SUB_BILL", name: "Subcontractor bill", entityType: "SubcontractorBill" },
  { key: "SUB_PAYMENT", name: "Subcontractor payment", entityType: "Payment" },
] as const;

// ---------------------------------------------------------------------------
// Orgs: states, regions, offices, GSTINs
// ---------------------------------------------------------------------------

const REGION_NAMES: Record<RegionKeyName, [string, string]> = {
  cg: ["Chhattisgarh", "CG"],
  mh: ["Maharashtra", "MH"],
  south: ["South", "SOUTH"],
  delhi: ["Delhi", "DEL"],
};

const OFFICES = [
  { id: "off_mumbai", regionId: "reg_mh", name: "Registered Office, Mumbai", kind: "REGISTERED", address: "Mumbai, Maharashtra" },
  { id: "off_chennai", regionId: "reg_south", name: "Branch Office, Chennai", kind: "BRANCH", address: "Chennai, Tamil Nadu" },
  { id: "off_delhi", regionId: "reg_delhi", name: "Delhi Regional Office", kind: "REGIONAL", address: "New Delhi" },
  { id: "off_korba", regionId: "reg_cg", name: "Korba Site Office", kind: "SITE_OFFICE", address: "Korba, Chhattisgarh" },
] as const;

const GST_STATE = new Map<string, string>(STATES.map((s) => [s.id, s.gst]));
const GSTINS = [
  { id: "gst_mh", state: "st_mh", addr: "Registered Office, Mumbai, Maharashtra", region: "reg_mh" },
  { id: "gst_tn", state: "st_tn", addr: "Branch Office, Chennai, Tamil Nadu", region: "reg_south" },
  { id: "gst_dl", state: "st_dl", addr: "Delhi Regional Office, New Delhi", region: "reg_delhi" },
  { id: "gst_cg", state: "st_cg", addr: "Korba Site Office, Korba, Chhattisgarh", region: "reg_cg" },
] as const;

// ---------------------------------------------------------------------------

export async function seedBase(prisma: PrismaClient) {
  // States, regions, offices
  await upsertAll(prisma.state, STATES.map((s) => ({ id: s.id, code: s.code, name: s.name, gstStateCode: s.gst })));
  await upsertAll(
    prisma.region,
    (Object.keys(RegionKey) as RegionKeyName[]).map((k) => ({
      id: RegionKey[k], name: REGION_NAMES[k][0], code: REGION_NAMES[k][1], stateId: StateOf[k], isActive: true,
    })),
  );
  await upsertAll(prisma.office, OFFICES.map((o) => ({ ...o })));

  // GSTINs (placeholders, see header) and region links (one default each)
  await upsertAll(
    prisma.gstRegistration,
    GSTINS.map((g) => ({
      id: g.id,
      gstin: makeGstin(GST_STATE.get(g.state)!, COMPANY.pan),
      legalName: COMPANY.legalName,
      tradeName: COMPANY.tradeName,
      stateId: g.state,
      panNumber: COMPANY.pan,
      address: g.addr,
      validFrom: new Date("2017-07-01"),
      isActive: true,
    })),
  );
  await upsertAll(
    prisma.regionGstRegistration,
    GSTINS.map((g, i) => ({ id: `rgst_${i + 1}`, regionId: g.region, gstRegistrationId: g.id, isDefault: true, validFrom: new Date("2017-07-01") })),
  );

  // Service lines and other configurable masters
  await upsertAll(prisma.serviceLine, SERVICE_LINES.map((l) => ({ id: l.id, name: l.name, defaultUnit: l.unit, isActive: true })));
  await upsertAll(
    prisma.tenderStage,
    STAGE_DEFS.map((s, i) => ({ id: stageId(s.key), name: s.name, sequence: i + 1, kind: s.kind, systemKey: s.key, isActive: true })),
  );
  await upsertAll(prisma.tenderResult, [
    { id: "res_won", name: "Won", outcome: "WON" as const, isActive: true },
    { id: "res_lost", name: "Lost", outcome: "LOST" as const, isActive: true },
    { id: "res_cancelled", name: "Cancelled", outcome: "NEUTRAL" as const, isActive: true },
    { id: "res_retender", name: "Retender", outcome: "NEUTRAL" as const, isActive: true },
  ]);
  await upsertAll(prisma.tenderType, TENDER_TYPES.map((name, i) => ({ id: tenderTypeId(i), name, isActive: true })));
  await upsertAll(prisma.documentType, DOC_TYPES.map((name, i) => ({ id: docTypeId(i), name, isActive: true })));
  // Default checklist: the first eight document types are mandatory for every tender type.
  await upsertAll(
    prisma.checklistTemplateItem,
    TENDER_TYPES.flatMap((_, t) =>
      DOC_TYPES.slice(0, 8).map((__, d) => ({
        id: `chk_${t + 1}_${d + 1}`, tenderTypeId: tenderTypeId(t), documentTypeId: docTypeId(d), isMandatory: true, sortOrder: d,
      })),
    ),
  );
  await upsertAll(
    prisma.projectStatus,
    [
      ["pst_mobilisation", "Mobilisation", "MOBILISATION"],
      ["pst_progress", "In progress", "IN_PROGRESS"],
      ["pst_hold", "On hold", "ON_HOLD"],
      ["pst_completed", "Completed", "COMPLETED"],
    ].map(([id, name, systemKey], i) => ({ id, name, sequence: i + 1, systemKey, isActive: true })),
  );
  await upsertAll(prisma.expenseCategory, EXPENSE_CATEGORIES.map((c) => ({ id: c.id, name: c.name, isActive: true })));
  await upsertAll(
    prisma.deductionType,
    DEDUCTION_TYPES.map((d) => ({
      id: d.id, code: d.code, name: d.name, calcMethod: d.method, defaultRate: d.rate, appliesTo: d.applies, isReleasable: d.releasable,
    })),
  );
  await upsertAll(prisma.labourType, [
    { id: "lt_monthly", name: "Monthly staff", payrollMode: "MONTHLY" as const, isActive: true },
    { id: "lt_daily", name: "Daily-wage worker", payrollMode: "DAILY" as const, isActive: true },
    { id: "lt_contract", name: "Contract labour (via contractor)", payrollMode: "CONTRACTOR" as const, isActive: true },
  ]);

  // Roles, permission catalogue, grants
  await upsertAll(
    prisma.role,
    ROLE_SPECS.map((r) => ({
      id: roleId(r.key), key: r.key, name: r.name, description: r.description, isSystem: true, isActive: true, layout: "OFFICE" as const, homePath: r.homePath,
    })),
  );
  await upsertAll(
    prisma.permission,
    MODULES.flatMap((m) => ACTIONS.map((a) => ({ id: permissionId(m, a), module: m, action: a }))),
  );
  await upsertAll(
    prisma.rolePermission,
    ROLE_SPECS.flatMap((r) =>
      (Object.entries(r.grants) as [Mod, readonly [PermissionAction[], PermissionScope]][]).flatMap(([module, [actions, scope]]) =>
        actions.map((a) => ({ id: `rp_${r.key}_${module}_${a}`, roleId: roleId(r.key), permissionId: permissionId(module, a), scope })),
      ),
    ),
  );

  // Approval flows, levels and thresholds
  await upsertAll(prisma.approvalFlow, FLOWS.map((f) => ({ id: `flow_${f.key.toLowerCase()}`, key: f.key, name: f.name, entityType: f.entityType, isActive: true })));
  await upsertAll(
    prisma.approvalFlowLevel,
    FLOWS.map((f) => ({
      id: `lvl_${f.key.toLowerCase()}_1`,
      flowId: `flow_${f.key.toLowerCase()}`,
      sequence: 1,
      name: "Director",
      approverRoleId: roleId("director"),
      regionScoped: false,
    })),
  );

  // Settings defaults (reminder offsets in days before the date)
  await upsertAll(prisma.setting, [
    { id: "set_reminder_tender_deadline", key: "reminder.tender_deadline_days", value: [7, 3, 1] },
    { id: "set_reminder_instrument_expiry", key: "reminder.instrument_expiry_days", value: [30, 7] },
    { id: "set_reminder_daily_report", key: "reminder.daily_report_overdue_hours", value: [0] },
  ]);
}

async function main() {
  assertNotProductionDb("db:seed:base");
  const prisma = new PrismaClient();
  try {
    await seedBase(prisma);
    console.log("Base seed complete.");
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed directly (prisma/seed.ts imports seedBase instead).
if (process.argv[1] && /seed-base\.(ts|js)$/.test(process.argv[1].replace(/\\/g, "/"))) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
