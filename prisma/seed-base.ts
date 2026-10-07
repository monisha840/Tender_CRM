/**
 * Base seed: the real masters every environment needs (dev, test, production).
 * Regions, GSTINs, roles + permission matrix (docs/go-live-plan.md section 2.2), approval flows and
 * thresholds (section 2.3), tender stages and the other configurable masters.
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
const VC: PermissionAction[] = ["VIEW", "CREATE"];
const VE: PermissionAction[] = ["VIEW", "EDIT"];
const VCE: PermissionAction[] = ["VIEW", "CREATE", "EDIT"];
const VCEA: PermissionAction[] = ["VIEW", "CREATE", "EDIT", "APPROVE", "REJECT"];
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
const REGION: PermissionScope = "OWN_REGION";
const PROJECTS: PermissionScope = "OWN_PROJECTS";
const OWN: PermissionScope = "OWN_RECORDS";

export const ROLE_SPECS: RoleSpec[] = [
  {
    key: "system_admin",
    name: "System Admin",
    description: "Manages users, roles, settings and masters. Does not approve business transactions.",
    homePath: "/settings",
    grants: {
      dashboard: [V, ALL],
      tenders: [V, ALL],
      instruments: [V, ALL],
      projects: [V, ALL],
      subcontractors: [V, ALL],
      sub_work_orders: [V, ALL],
      sub_bills: [V, ALL],
      sub_payments: [V, ALL],
      daily_reports: [V, ALL],
      notifications: [V, OWN],
      audit_log: [V, ALL],
      settings: [VCE, ALL],
      users: [VCED, ALL],
      gst_invoices: [V, ALL],
    },
  },
  {
    key: "director",
    name: "Director",
    description: "All regions. Final approver for tenders, conversions, work orders, bills and payments.",
    homePath: "/dashboard",
    grants: {
      dashboard: [V, ALL],
      tenders: [VA, ALL],
      tender_go_no_go: [["APPROVE", "REJECT"], ALL],
      instruments: [VA, ALL],
      tender_conversion: [["APPROVE", "REJECT"], ALL],
      projects: [V, ALL],
      subcontractors: [V, ALL],
      sub_work_orders: [VA, ALL],
      sub_bills: [VA, ALL],
      sub_payments: [VA, ALL],
      daily_reports: [V, ALL],
      approvals: [VA, ALL],
      notifications: [V, OWN],
      audit_log: [V, ALL],
      settings: [V, ALL],
      users: [V, ALL],
      gst_invoices: [V, ALL],
      payroll: [V, ALL],
    },
  },
  {
    key: "regional_head",
    name: "Regional Head",
    description: "Assigned region(s). Approves within the thresholds in approval_thresholds; above that a Director approves.",
    homePath: "/dashboard",
    grants: {
      dashboard: [V, REGION],
      tenders: [VCEA, REGION],
      tender_go_no_go: [["APPROVE", "REJECT"], REGION],
      instruments: [V, REGION],
      tender_conversion: [["APPROVE", "REJECT"], REGION],
      projects: [VCE, REGION],
      subcontractors: [VCE, REGION],
      sub_work_orders: [VCEA, REGION],
      sub_bills: [VA, REGION],
      sub_payments: [V, REGION],
      daily_reports: [V, REGION],
      approvals: [VA, REGION],
      notifications: [V, OWN],
      audit_log: [V, REGION],
      gst_invoices: [V, REGION],
      payroll: [V, REGION],
    },
  },
  {
    key: "tender_exec",
    name: "Tender Executive",
    description: "All regions. Registers tenders, prepares bids and documents, submits GO/NO-GO and conversion for approval.",
    homePath: "/tenders",
    grants: {
      dashboard: [V, ALL],
      tenders: [VCED, ALL],
      tender_go_no_go: [["SUBMIT"], ALL],
      instruments: [VC, ALL],
      tender_conversion: [["SUBMIT"], ALL],
      projects: [V, ALL],
      approvals: [V, OWN],
      notifications: [V, OWN],
    },
  },
  {
    key: "project_manager",
    name: "Project Manager",
    description: "Own projects. Updates progress, raises subcontractor work orders and bills, reviews daily reports. (MVP depth)",
    homePath: "/projects",
    grants: {
      dashboard: [V, PROJECTS],
      tenders: [V, PROJECTS],
      instruments: [V, PROJECTS],
      projects: [VE, PROJECTS],
      subcontractors: [VC, ALL], // the subcontractor master is shared, not project-scoped
      sub_work_orders: [VCE, PROJECTS],
      sub_bills: [VC, PROJECTS],
      sub_payments: [V, PROJECTS],
      daily_reports: [["VIEW", "REVIEW"], PROJECTS],
      approvals: [V, OWN],
      notifications: [V, OWN],
      gst_invoices: [V, PROJECTS],
      payroll: [V, PROJECTS], // no salary figures (masked in S2)
    },
  },
  {
    key: "accounts",
    name: "Accounts",
    description: "All regions. Records EMD/PBG details and subcontractor payments, views balances. (MVP depth)",
    homePath: "/finance",
    grants: {
      dashboard: [V, ALL],
      tenders: [V, ALL], // EMD / fees
      instruments: [VCE, ALL],
      projects: [V, ALL],
      subcontractors: [VCE, ALL],
      sub_work_orders: [V, ALL],
      sub_bills: [VE, ALL],
      sub_payments: [VC, ALL],
      approvals: [V, OWN],
      notifications: [V, OWN],
      audit_log: [V, ALL],
      gst_invoices: [VCE, ALL],
      payroll: [V, ALL], // payments only
    },
  },
];

export const roleId = (key: string) => `role_${key}`;
export const permissionId = (module: string, action: string) => `perm_${module}_${action}`;

// ---------------------------------------------------------------------------
// Approval flows and thresholds (go-live-plan 2.3). Routing: first level whose role threshold covers the amount.
// ---------------------------------------------------------------------------

const TEN_LAKH = "1000000.00";
const ONE_CRORE = "10000000.00";

const FLOWS = [
  { key: "GO_NO_GO", name: "Tender GO / NO-GO", entityType: "Tender", levels: ["regional_head", "director"], rhMax: ONE_CRORE },
  { key: "TENDER_CONVERSION", name: "Convert tender to project", entityType: "Tender", levels: ["regional_head", "director"], rhMax: ONE_CRORE },
  { key: "WORK_ORDER", name: "Subcontractor work order", entityType: "SubcontractorWorkOrder", levels: ["regional_head", "director"], rhMax: TEN_LAKH },
  { key: "SUB_BILL", name: "Subcontractor bill", entityType: "SubcontractorBill", levels: ["regional_head", "director"], rhMax: TEN_LAKH },
  { key: "SUB_PAYMENT", name: "Subcontractor payment", entityType: "Payment", levels: ["director"], rhMax: null },
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
    FLOWS.flatMap((f) =>
      f.levels.map((role, i) => ({
        id: `lvl_${f.key.toLowerCase()}_${i + 1}`,
        flowId: `flow_${f.key.toLowerCase()}`,
        sequence: i + 1,
        name: role === "regional_head" ? "Regional Head" : "Director",
        approverRoleId: roleId(role),
        regionScoped: role === "regional_head",
      })),
    ),
  );
  await upsertAll(
    prisma.approvalThreshold,
    FLOWS.flatMap((f) =>
      f.rhMax ? [{ id: `thr_${f.key.toLowerCase()}_rh`, flowId: `flow_${f.key.toLowerCase()}`, roleId: roleId("regional_head"), maxAmount: f.rhMax }] : [],
    ),
  );

  // Settings defaults (reminder offsets in days before the date)
  await upsertAll(prisma.setting, [
    { id: "set_reminder_tender_deadline", key: "reminder.tender_deadline_days", value: [7, 3, 1] },
    { id: "set_reminder_instrument_expiry", key: "reminder.instrument_expiry_days", value: [30, 7] },
    { id: "set_reminder_daily_report", key: "reminder.daily_report_overdue_hours", value: [0] },
  ]);
}

async function main() {
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
