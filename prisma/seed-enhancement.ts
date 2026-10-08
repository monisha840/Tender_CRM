/**
 * Enhancement-release seed: permissions, statutory rates, settings, company documents, bill-readiness template/demo
 * checks and tender-stage colours for the enhancement modules.
 *
 * Idempotent and ADDITIVE: it only looks rows up by natural key and creates what is missing. It never updates an
 * existing row (except filling a null TenderStage.color), never deletes, truncates or resets. Safe to run repeatedly.
 *
 * It deliberately does NOT call assertNotProductionDb: the owner runs it against the shared database after the
 * additive migration 20261008100000_enhancement_release. If those tables are absent it stops with a friendly message.
 *
 * Run:  npm run db:seed:enhancement
 * The data builders below are pure and exported (unit-tested without a DB in tests/unit/seed-enhancement.test.ts).
 */
import { PrismaClient, type PermissionAction, type PermissionScope } from "@prisma/client";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Rows of `desired` whose natural key is not in `existingKeys`. The whole idempotency rule lives here. */
export function missingRows<T>(desired: readonly T[], existingKeys: Iterable<string>, keyOf: (row: T) => string): T[] {
  const have = new Set(existingKeys);
  const seen = new Set<string>();
  return desired.filter((row) => {
    const k = keyOf(row);
    if (have.has(k) || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const utcDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** `asOf` shifted by whole days, as a date-only UTC value. */
export function addDays(asOf: Date, days: number): Date {
  const d = utcDate(isoDate(asOf));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
/** "YYYY-MM" of the calendar month before `asOf`. */
export function previousPeriodMonth(asOf: Date): string {
  const d = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

// ---------------------------------------------------------------------------
// 1. Permissions
// ---------------------------------------------------------------------------

export const ENHANCEMENT_MODULES = ["money_locked", "contract_pnl", "documents", "bill_readiness", "gate_reconciliation", "bid_pricing"] as const;
export type EnhancementModule = (typeof ENHANCEMENT_MODULES)[number];

/** Same catalogue as seed-base: every module has a row for every action so the matrix editor is uniform. */
export const ALL_ACTIONS: PermissionAction[] = ["VIEW", "CREATE", "EDIT", "DELETE", "APPROVE", "REJECT", "SUBMIT", "REVIEW", "ASSIGN_WORK", "MANAGE_FINANCE"];

const V: PermissionAction[] = ["VIEW"];
const VCE: PermissionAction[] = ["VIEW", "CREATE", "EDIT"];
const VCED: PermissionAction[] = ["VIEW", "CREATE", "EDIT", "DELETE"];

/** Seed-time role keys already used by seed-base: admin edits, director views. Roles are still read from the DB. */
export const ENHANCEMENT_GRANTS: Record<string, Record<EnhancementModule, PermissionAction[]>> = {
  system_admin: {
    money_locked: ["VIEW", "EDIT"], // request refund / mark released
    contract_pnl: V, // computed
    documents: VCED,
    bill_readiness: VCE,
    gate_reconciliation: VCE,
    bid_pricing: VCE,
  },
  director: {
    money_locked: V,
    contract_pnl: V,
    documents: V,
    bill_readiness: V,
    gate_reconciliation: V,
    bid_pricing: V,
  },
};

export const permissionId = (module: string, action: string) => `perm_${module}_${action}`;
export const rolePermissionId = (roleKey: string, module: string, action: string) => `rp_${roleKey}_${module}_${action}`;

export function buildPermissions() {
  return ENHANCEMENT_MODULES.flatMap((m) => ALL_ACTIONS.map((a) => ({ id: permissionId(m, a), module: m, action: a })));
}
export const permissionKey = (p: { module: string; action: string }) => `${p.module}:${p.action}`;

export interface GrantRow {
  id: string;
  roleKey: string;
  module: string;
  action: PermissionAction;
  scope: PermissionScope;
}
export function buildGrants(): GrantRow[] {
  return Object.entries(ENHANCEMENT_GRANTS).flatMap(([roleKey, mods]) =>
    (Object.entries(mods) as [EnhancementModule, PermissionAction[]][]).flatMap(([module, actions]) =>
      actions.map((action) => ({ id: rolePermissionId(roleKey, module, action), roleKey, module, action, scope: "ALL" as PermissionScope })),
    ),
  );
}

// ---------------------------------------------------------------------------
// 2. Statutory rates (demo / indicative)
// ---------------------------------------------------------------------------

const NOTE = "demo/indicative, verify against current notification";

export interface RateRow {
  id: string;
  code: string;
  label: string;
  unit: "PERCENT" | "AMOUNT_PER_DAY" | "AMOUNT_PER_MONTH" | "AMOUNT";
  value: string;
  effectiveFrom: string; // YYYY-MM-DD
  sourceNote: string;
  category: string | null;
}
/** Natural key: code + category + effectiveFrom. */
export const rateKey = (r: { code: string; category: string | null; effectiveFrom: string }) => `${r.code}|${r.category ?? ""}|${r.effectiveFrom}`;

export function buildStatutoryRates(): RateRow[] {
  const rate = (code: string, label: string, unit: RateRow["unit"], value: string, effectiveFrom: string, note: string, category: string | null = null): RateRow => ({
    id: `srate_${code.toLowerCase()}${category ? `_${category}` : ""}_${effectiveFrom}`,
    code, label, unit, value, effectiveFrom, category, sourceNote: `${note} (${NOTE})`,
  });
  const base = "2025-04-01";
  const next = "2026-04-01";
  const wages: [string, string, string][] = [
    ["unskilled", "783.00", "812.00"],
    ["semi-skilled", "868.00", "898.00"],
    ["skilled", "954.00", "986.00"],
  ];
  return [
    rate("PF_EMPLOYER", "PF employer contribution", "PERCENT", "12", base, "EPF Act: employer share of basic+DA"),
    rate("PF_WAGE_CEILING", "PF wage ceiling", "AMOUNT_PER_MONTH", "15000", base, "EPF statutory wage ceiling"),
    rate("ESI_EMPLOYER", "ESI employer contribution", "PERCENT", "3.25", base, "ESI Act employer share"),
    rate("ESI_EMPLOYEE", "ESI employee contribution", "PERCENT", "0.75", base, "ESI Act employee share"),
    rate("ESI_WAGE_CEILING", "ESI wage ceiling", "AMOUNT_PER_MONTH", "21000", base, "ESI coverage ceiling"),
    rate("BONUS", "Statutory bonus", "PERCENT", "8.33", base, "Payment of Bonus Act minimum bonus"),
    rate("GST_DEFAULT", "Default GST rate on services", "PERCENT", "18", base, "GST on works/manpower services"),
    ...wages.flatMap(([cat, v1, v2]) => [
      rate("MIN_WAGE", `Minimum wage per day (${cat})`, "AMOUNT_PER_DAY", v1, base, `Central sphere, ${cat}`, cat),
      rate("MIN_WAGE", `Minimum wage per day (${cat})`, "AMOUNT_PER_DAY", v2, next, `Central sphere, ${cat}, revised`, cat),
    ]),
  ];
}

// ---------------------------------------------------------------------------
// 3. Settings
// ---------------------------------------------------------------------------

/** Module toggles (features.<module>), matching SETTING_KEYS in src/modules/settings/keys.ts. */
export const FEATURE_MODULES = [
  "money_locked", "contract_pnl", "documents", "bill_readiness", "gate_reconciliation", "bid_pricing",
] as const;

export interface SettingRow {
  id: string;
  key: string;
  value: unknown;
}
export function buildSettings(): SettingRow[] {
  const defaults: [string, unknown][] = [
    ["reminders.deadlineDays", [7, 3, 1]],
    ["reminders.documentExpiryDays", [60, 30, 7]],
    ["reminders.moneyLockedExpiryDays", [30, 15, 7]],
    ["health.amberDelayPct", 5],
    ["health.redDelayPct", 15],
    ["billing.defaultGstPct", 18],
    ["billing.paymentTermsDays", 30],
    ["pnl.lowMarginPct", 10],
    ["gate.hoursToleranceHrs", 0.5],
    ...FEATURE_MODULES.map((m): [string, unknown] => [`features.${m}`, true]),
  ];
  return defaults.map(([key, value]) => ({ id: `set_enh_${key.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`, key, value }));
}

// ---------------------------------------------------------------------------
// 4. Document types and company documents
// ---------------------------------------------------------------------------

export interface CompanyDocSpec {
  key: string;
  /** DocumentType name to create when no alias matches. */
  typeName: string;
  /** Existing DocumentType names (case-insensitive) to reuse instead of creating. */
  aliases: string[];
  title: string;
  referenceNo: string;
  /** Days relative to asOf. */
  issueOffsetDays: number;
  /** Days relative to asOf; null = does not expire. */
  expiryOffsetDays: number | null;
  /** Added to every tender type's checklist as mandatory when absent. */
  checklistMandatory: boolean;
  notes: string | null;
}
export const COMPANY_DOC_SPECS: CompanyDocSpec[] = [
  { key: "gst", typeName: "GST certificate", aliases: ["GST registration certificate"], title: "GST registration certificate", referenceNo: "Demo GST-REG", issueOffsetDays: -2900, expiryOffsetDays: null, checklistMandatory: true, notes: "Demo data." },
  { key: "pan", typeName: "PAN", aliases: ["PAN card"], title: "Company PAN card", referenceNo: "Demo PAN", issueOffsetDays: -3500, expiryOffsetDays: null, checklistMandatory: true, notes: "Demo data." },
  { key: "iso9001", typeName: "ISO 9001", aliases: [], title: "ISO 9001:2015 quality certificate", referenceNo: "Demo ISO-9001", issueOffsetDays: -300, expiryOffsetDays: 790, checklistMandatory: false, notes: "Demo data." },
  { key: "udyam", typeName: "Udyam / MSME", aliases: [], title: "Udyam registration", referenceNo: "Demo UDYAM", issueOffsetDays: -1500, expiryOffsetDays: null, checklistMandatory: false, notes: "Demo data." },
  { key: "pf", typeName: "PF registration", aliases: [], title: "EPF establishment registration", referenceNo: "Demo PF-REG", issueOffsetDays: -2500, expiryOffsetDays: null, checklistMandatory: false, notes: "Demo data." },
  { key: "esi", typeName: "ESI registration", aliases: [], title: "ESIC employer registration", referenceNo: "Demo ESI-REG", issueOffsetDays: -2500, expiryOffsetDays: null, checklistMandatory: false, notes: "Demo data." },
  {
    key: "labour_licence", typeName: "Labour licence", aliases: ["Contract labour licence"], title: "Contract labour licence", referenceNo: "Demo CLRA-LIC",
    issueOffsetDays: -377, expiryOffsetDays: -12, checklistMandatory: true,
    notes: "DEMO OF THE SUBMITTED-BLOCK: this mandatory document is deliberately EXPIRED so a tender cannot move to Submitted until it is renewed. Renew or replace it to clear the block.",
  },
  { key: "solvency", typeName: "Solvency certificate", aliases: ["Solvency certificate"], title: "Bank solvency certificate", referenceNo: "Demo SOLV", issueOffsetDays: -345, expiryOffsetDays: 20, checklistMandatory: false, notes: "Demo data: expiring soon." },
  { key: "experience", typeName: "Experience certificate", aliases: ["Experience certificates"], title: "Experience certificate (NTPC Korba)", referenceNo: "Demo EXP", issueOffsetDays: -200, expiryOffsetDays: 400, checklistMandatory: false, notes: "Demo data." },
  { key: "dsc", typeName: "DSC", aliases: [], title: "Digital signature certificate (Class 3)", referenceNo: "Demo DSC", issueOffsetDays: -705, expiryOffsetDays: 25, checklistMandatory: false, notes: "Demo data: expiring soon." },
];

export const companyDocId = (key: string) => `cdoc_enh_${key}`;
export const newDocTypeId = (key: string) => `dtype_enh_${key}`;

export interface CompanyDocRow {
  id: string;
  specKey: string;
  title: string;
  referenceNo: string;
  issueDate: Date;
  expiryDate: Date | null;
  notes: string | null;
}
export function buildCompanyDocuments(asOf: Date): CompanyDocRow[] {
  return COMPANY_DOC_SPECS.map((s) => ({
    id: companyDocId(s.key), specKey: s.key, title: s.title, referenceNo: s.referenceNo,
    issueDate: addDays(asOf, s.issueOffsetDays),
    expiryDate: s.expiryOffsetDays == null ? null : addDays(asOf, s.expiryOffsetDays),
    notes: s.notes,
  }));
}

/** Resolve a spec to an existing DocumentType id (by name or alias, case-insensitive) or null if it must be created. */
export function resolveDocType(spec: CompanyDocSpec, existing: { id: string; name: string }[]): string | null {
  const names = [spec.typeName, ...spec.aliases].map((n) => n.toLowerCase());
  return existing.find((e) => names.includes(e.name.toLowerCase()))?.id ?? null;
}

// ---------------------------------------------------------------------------
// 5. Bill readiness
// ---------------------------------------------------------------------------

export const BILL_READINESS_ITEMS = [
  { code: "WAGE_REGISTER", label: "Wage register", isMandatory: true },
  { code: "PF_CHALLAN", label: "PF challan and ECR", isMandatory: true },
  { code: "ESI_CHALLAN", label: "ESI challan", isMandatory: true },
  { code: "ATTENDANCE_SHEET", label: "Signed attendance sheet", isMandatory: true },
  { code: "BANK_WAGE_PROOF", label: "Bank proof of wage payment", isMandatory: true },
  { code: "LABOUR_LICENCE_VALID", label: "Labour licence valid for the month", isMandatory: true },
] as const;
export const templateItemId = (code: string) => `brt_${code.toLowerCase()}`;
export const buildTemplateItems = () => BILL_READINESS_ITEMS.map((it, i) => ({ id: templateItemId(it.code), ...it, sortOrder: i + 1 }));

export interface ReadinessCheckRow {
  projectId: string;
  periodMonth: string;
  code: string;
  isDone: boolean;
  doneOn: Date | null;
  reference: string | null;
  note: string | null;
}
export const checkKey = (c: { projectId: string; periodMonth: string; code: string }) => `${c.projectId}|${c.periodMonth}|${c.code}`;

/** First project fully done (Ready); second leaves bank proof and labour licence undone (Blocked). */
export function buildReadinessChecks(projectIds: readonly string[], asOf: Date): ReadinessCheckRow[] {
  const periodMonth = previousPeriodMonth(asOf);
  const doneOn = addDays(asOf, -5);
  const plan: { projectId: string | undefined; undone: string[] }[] = [
    { projectId: projectIds[0], undone: [] },
    { projectId: projectIds[1], undone: ["BANK_WAGE_PROOF", "LABOUR_LICENCE_VALID"] },
  ];
  return plan.flatMap(({ projectId, undone }) =>
    projectId
      ? BILL_READINESS_ITEMS.map((it) => {
          const isDone = !undone.includes(it.code);
          return {
            projectId, periodMonth, code: it.code, isDone,
            doneOn: isDone ? doneOn : null,
            reference: isDone ? `Demo ${it.code}` : null,
            note: isDone ? null : "Demo: pending, keeps this month's bill Blocked.",
          };
        })
      : [],
  );
}

// ---------------------------------------------------------------------------
// 6. Tender stage colours (design token names)
// ---------------------------------------------------------------------------

export const STAGE_COLORS: Record<string, string> = {
  NEW: "neutral",
  UNDER_EVALUATION: "warning",
  BID_PREPARING: "accent",
  SUBMITTED: "accent",
  WON: "success",
  LOST: "danger",
};

// ---------------------------------------------------------------------------
// DB layer
// ---------------------------------------------------------------------------

const REQUIRED_TABLES = ["StatutoryRate", "CompanyDocument", "BillReadinessTemplateItem", "BillReadinessCheck", "GateAttendanceMapping", "TenderPricing"];

/** Returns a friendly problem description, or null when the additive migration has been applied. */
export async function checkSchemaReady(prisma: PrismaClient): Promise<string | null> {
  for (const t of REQUIRED_TABLES) {
    const r = await prisma.$queryRaw<{ ok: string | null }[]>`SELECT to_regclass(${`public."${t}"`})::text AS ok`;
    if (!r[0]?.ok) return `Table "${t}" does not exist. Apply the additive migration first (npm run db:deploy), then re-run this seed.`;
  }
  const col = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name = 'TenderStage' AND column_name = 'color'`;
  if (!col[0]?.n) return `Column "TenderStage.color" is missing. Apply migration 20261008100000_enhancement_release first.`;
  return null;
}

export type SeedCounts = Record<string, number>;

export async function seedEnhancement(prisma: PrismaClient, asOf: Date = new Date()): Promise<SeedCounts> {
  const counts: SeedCounts = {};

  // 1. Permissions + grants
  const perms = await prisma.permission.findMany({ where: { module: { in: [...ENHANCEMENT_MODULES] } }, select: { id: true, module: true, action: true } });
  const newPerms = missingRows(buildPermissions(), perms.map(permissionKey), permissionKey);
  if (newPerms.length) await prisma.permission.createMany({ data: newPerms, skipDuplicates: true });
  counts.permissions = newPerms.length;

  const allPerms = await prisma.permission.findMany({ where: { module: { in: [...ENHANCEMENT_MODULES] } }, select: { id: true, module: true, action: true } });
  const permIdByKey = new Map(allPerms.map((p) => [permissionKey(p), p.id]));
  const roles = await prisma.role.findMany({ where: { key: { in: Object.keys(ENHANCEMENT_GRANTS) } }, select: { id: true, key: true } });
  const roleIdByKey = new Map(roles.map((r) => [r.key, r.id]));
  const grants = buildGrants().filter((g) => {
    if (!roleIdByKey.has(g.roleKey)) {
      console.warn(`Role '${g.roleKey}' not found; skipping its grants (run db:seed:base first).`);
      return false;
    }
    return permIdByKey.has(`${g.module}:${g.action}`);
  });
  const rpKey = (roleId: string, permissionId: string) => `${roleId}|${permissionId}`;
  const grantKey = (g: GrantRow) => rpKey(roleIdByKey.get(g.roleKey)!, permIdByKey.get(`${g.module}:${g.action}`)!);
  const haveRp = await prisma.rolePermission.findMany({
    where: { roleId: { in: roles.map((r) => r.id) }, permissionId: { in: allPerms.map((p) => p.id) } },
    select: { roleId: true, permissionId: true },
  });
  const newGrants = missingRows(grants, haveRp.map((r) => rpKey(r.roleId, r.permissionId)), grantKey);
  if (newGrants.length) {
    await prisma.rolePermission.createMany({
      data: newGrants.map((g) => ({ id: g.id, roleId: roleIdByKey.get(g.roleKey)!, permissionId: permIdByKey.get(`${g.module}:${g.action}`)!, scope: g.scope })),
      skipDuplicates: true,
    });
  }
  counts.rolePermissions = newGrants.length;

  // 2. Statutory rates
  const rates = await prisma.statutoryRate.findMany({ where: { deletedAt: null }, select: { code: true, category: true, effectiveFrom: true } });
  const newRates = missingRows(
    buildStatutoryRates(),
    rates.map((r) => rateKey({ code: r.code, category: r.category, effectiveFrom: isoDate(r.effectiveFrom) })),
    rateKey,
  );
  if (newRates.length) {
    await prisma.statutoryRate.createMany({
      data: newRates.map((r) => ({ id: r.id, code: r.code, label: r.label, unit: r.unit, value: r.value, effectiveFrom: utcDate(r.effectiveFrom), sourceNote: r.sourceNote, category: r.category })),
      skipDuplicates: true,
    });
  }
  counts.statutoryRates = newRates.length;

  // 3. Settings (global rows only; only when the key is absent)
  const settings = await prisma.setting.findMany({ where: { regionId: null }, select: { key: true } });
  const newSettings = missingRows(buildSettings(), settings.map((s) => s.key), (s) => s.key);
  if (newSettings.length) {
    await prisma.setting.createMany({ data: newSettings.map((s) => ({ id: s.id, key: s.key, value: s.value as object | number })), skipDuplicates: true });
  }
  counts.settings = newSettings.length;

  // 4. Document types, company documents, checklist flags
  const docTypes = await prisma.documentType.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const typeIdBySpec = new Map<string, string>();
  const toCreate: { id: string; name: string; isActive: boolean }[] = [];
  for (const s of COMPANY_DOC_SPECS) {
    const found = resolveDocType(s, docTypes);
    if (found) typeIdBySpec.set(s.key, found);
    else {
      toCreate.push({ id: newDocTypeId(s.key), name: s.typeName, isActive: true });
      typeIdBySpec.set(s.key, newDocTypeId(s.key));
    }
  }
  if (toCreate.length) await prisma.documentType.createMany({ data: toCreate, skipDuplicates: true });
  counts.documentTypes = toCreate.length;

  const haveDocs = await prisma.companyDocument.findMany({ select: { id: true } });
  const newDocs = missingRows(buildCompanyDocuments(asOf), haveDocs.map((d) => d.id), (d) => d.id);
  if (newDocs.length) {
    await prisma.companyDocument.createMany({
      data: newDocs.map((d) => ({
        id: d.id, documentTypeId: typeIdBySpec.get(d.specKey)!, title: d.title, referenceNo: d.referenceNo,
        issueDate: d.issueDate, expiryDate: d.expiryDate, notes: d.notes,
      })),
      skipDuplicates: true,
    });
  }
  counts.companyDocuments = newDocs.length;

  const tenderTypes = await prisma.tenderType.findMany({ where: { deletedAt: null }, select: { id: true } });
  const checklist = await prisma.checklistTemplateItem.findMany({ select: { tenderTypeId: true, documentTypeId: true } });
  const chkKey = (c: { tenderTypeId: string; documentTypeId: string }) => `${c.tenderTypeId}|${c.documentTypeId}`;
  const wanted = tenderTypes.flatMap((t) =>
    COMPANY_DOC_SPECS.filter((s) => s.checklistMandatory).map((s, i) => ({
      id: `chk_enh_${t.id}_${s.key}`, tenderTypeId: t.id, documentTypeId: typeIdBySpec.get(s.key)!, isMandatory: true, sortOrder: 100 + i,
    })),
  );
  const newChk = missingRows(wanted, checklist.map(chkKey), chkKey);
  if (newChk.length) await prisma.checklistTemplateItem.createMany({ data: newChk, skipDuplicates: true });
  counts.checklistItems = newChk.length;

  // 5. Bill readiness template + demo checks
  const items = await prisma.billReadinessTemplateItem.findMany({ select: { id: true, code: true } });
  const newItems = missingRows(buildTemplateItems(), items.map((i) => i.code), (i) => i.code);
  if (newItems.length) await prisma.billReadinessTemplateItem.createMany({ data: newItems, skipDuplicates: true });
  counts.billReadinessItems = newItems.length;
  const itemRows = await prisma.billReadinessTemplateItem.findMany({ select: { id: true, code: true } });
  const itemIdByCode = new Map(itemRows.map((i) => [i.code, i.id]));
  const codeById = new Map(itemRows.map((i) => [i.id, i.code]));

  const projects = await prisma.project.findMany({ where: { deletedAt: null }, orderBy: { code: "asc" }, take: 2, select: { id: true } });
  const wantedChecks = buildReadinessChecks(projects.map((p) => p.id), asOf).filter((c) => itemIdByCode.has(c.code));
  const haveChecks = wantedChecks.length
    ? await prisma.billReadinessCheck.findMany({
        where: { projectId: { in: projects.map((p) => p.id) }, periodMonth: { in: [...new Set(wantedChecks.map((c) => c.periodMonth))] } },
        select: { projectId: true, periodMonth: true, templateItemId: true },
      })
    : [];
  const newChecks = missingRows(
    wantedChecks,
    haveChecks.map((c) => checkKey({ projectId: c.projectId, periodMonth: c.periodMonth, code: codeById.get(c.templateItemId) ?? "" })),
    checkKey,
  );
  if (newChecks.length) {
    await prisma.billReadinessCheck.createMany({
      data: newChecks.map((c) => ({
        id: `brc_${c.projectId}_${c.periodMonth}_${c.code.toLowerCase()}`, projectId: c.projectId, periodMonth: c.periodMonth,
        templateItemId: itemIdByCode.get(c.code)!, isDone: c.isDone, doneOn: c.doneOn, reference: c.reference, note: c.note,
      })),
      skipDuplicates: true,
    });
  }
  counts.billReadinessChecks = newChecks.length;

  // 6. Tender stage colours: only where null
  let colored = 0;
  const stages = await prisma.tenderStage.findMany({ where: { color: null, deletedAt: null }, select: { id: true, systemKey: true } });
  for (const s of stages) {
    const color = s.systemKey ? STAGE_COLORS[s.systemKey] : undefined;
    if (color) {
      await prisma.tenderStage.updateMany({ where: { id: s.id, color: null }, data: { color } });
      colored++;
    }
  }
  counts.tenderStageColors = colored;

  return counts;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const problem = await checkSchemaReady(prisma);
    if (problem) {
      console.error(`Enhancement seed not run. ${problem}`);
      process.exitCode = 1;
      return;
    }
    const counts = await seedEnhancement(prisma);
    console.log("Enhancement seed complete (rows newly created; 0 = already present):");
    for (const [k, v] of Object.entries(counts)) console.log(`  ${k}: ${v}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && /seed-enhancement\.(ts|js)$/.test(process.argv[1].replace(/\\/g, "/"))) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
