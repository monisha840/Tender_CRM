import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/server/prisma";
import { SERVER_DB_TAG } from "@/lib/server/invalidate";
import { SETTING_DEFS, SETTING_KEYS, parseSetting, type CompanyProfile, type FeatureModule } from "./keys";
import { envOverride, isFeatureOn, resolveAppSettings, type AppSettings } from "./runtime";

/** All global Setting rows as `key -> value`. */
async function loadRawSettings(): Promise<Record<string, unknown>> {
  const rows = await prisma.setting.findMany({ where: { regionId: null, deletedAt: null }, select: { key: true, value: true } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * The run-time settings snapshot, cached like the shared server db and expired by the same tag (runAction invalidates it
 * after every write, so an admin sees their own change on the next render). Any failure falls back to the defaults.
 */
export async function loadAppSettings(): Promise<AppSettings> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 600 });
  cacheTag(SERVER_DB_TAG);
  try {
    return resolveAppSettings(await loadRawSettings());
  } catch (e) {
    console.error("[settings] could not load settings, using defaults", e);
    return resolveAppSettings();
  }
}

/** Effective "finance / payroll / daily work" gate: env flag when explicitly set, otherwise any of the three toggles. */
export function effectivePhase67(settings: AppSettings, envFlag: string | undefined): boolean {
  const o = envOverride(envFlag);
  if (o !== null) return o;
  return settings.features.daily_work || settings.features.finance_gst || settings.features.payroll;
}

/**
 * Server helper for route layouts of toggle-able modules: `if (!(await isFeatureEnabled("money_locked"))) notFound();`
 * Reads Settings > Feature toggles; the finance/payroll/daily-work modules also honour the env override.
 */
export async function isFeatureEnabled(module: FeatureModule): Promise<boolean> {
  return isFeatureOn(module, envOverride(process.env.NEXT_PUBLIC_FEATURE_FINANCE_PAYROLL), await loadAppSettings());
}

// ---------------------------------------------------------------------------------------------------------------
// Settings page data (plain JSON for the client)
// ---------------------------------------------------------------------------------------------------------------

export interface SettingsPageData {
  values: Record<string, unknown>;
  /** Resolved feature toggles (stored value, or the environment default when unset). */
  features: AppSettings["features"];
  company: CompanyProfile;
  states: { id: string; name: string; gstStateCode: string }[];
  regions: { id: string; name: string; code: string; stateId: string; isActive: boolean }[];
  offices: { id: string; regionId: string; name: string; kind: string; address: string }[];
  gstins: { id: string; gstin: string; legalName: string; tradeName: string | null; stateId: string; panNumber: string; address: string; isActive: boolean; isPlaceholder: boolean; regionIds: string[] }[];
  stages: { id: string; name: string; sequence: number; kind: string; color: string | null; systemKey: string | null; isActive: boolean }[];
  tenderTypes: { id: string; name: string }[];
  documentTypes: { id: string; name: string }[];
  checklist: { id: string; tenderTypeId: string; documentTypeId: string; isMandatory: boolean; sortOrder: number }[];
  serviceLines: { id: string; name: string; defaultUnit: string; isActive: boolean }[];
  approvalFlows: { key: string; name: string; isActive: boolean }[];
  statutoryRates: { id: string; code: string; label: string; unit: string; value: string; effectiveFrom: string; sourceNote: string | null; regionId: string | null; category: string | null; isActive: boolean }[];
  deductionTypes: { id: string; code: string; name: string; calcMethod: string; defaultRate: string | null }[];
  projectStatuses: { id: string; name: string; sequence: number; systemKey: string | null; isActive: boolean }[];
  users: { id: string; name: string; email: string; isActive: boolean; roleKey: string | null; roleName: string | null; lastLoginAt: string | null }[];
  roles: { key: string; name: string }[];
  canResetPasswords: boolean;
  envOverride: boolean | null;
}

export async function loadSettingsPage(): Promise<SettingsPageData> {
  const live = { deletedAt: null } as const;
  const [raw, states, regions, offices, gsts, links, stages, tenderTypes, documentTypes, checklist, serviceLines, flows, rates, deductions, statuses, users, roles] = await Promise.all([
    loadRawSettings(),
    prisma.state.findMany({ where: live, orderBy: { name: "asc" } }),
    prisma.region.findMany({ where: live, orderBy: { name: "asc" } }),
    prisma.office.findMany({ where: live, orderBy: { name: "asc" } }),
    prisma.gstRegistration.findMany({ where: live, orderBy: { gstin: "asc" } }),
    prisma.regionGstRegistration.findMany({ where: live }),
    prisma.tenderStage.findMany({ where: live, orderBy: { sequence: "asc" } }),
    prisma.tenderType.findMany({ where: { ...live, isActive: true }, orderBy: { name: "asc" } }),
    prisma.documentType.findMany({ where: { ...live, isActive: true }, orderBy: { name: "asc" } }),
    prisma.checklistTemplateItem.findMany({ where: live, orderBy: [{ tenderTypeId: "asc" }, { sortOrder: "asc" }] }),
    prisma.serviceLine.findMany({ where: live, orderBy: { name: "asc" } }),
    prisma.approvalFlow.findMany({ where: live, orderBy: { name: "asc" } }),
    prisma.statutoryRate.findMany({ where: live, orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }] }).catch(() => []), // table arrives with the enhancement migration
    prisma.deductionType.findMany({ where: live, orderBy: { name: "asc" } }),
    prisma.projectStatus.findMany({ where: live, orderBy: { sequence: "asc" } }),
    prisma.user.findMany({ where: live, orderBy: { name: "asc" }, include: { roles: { where: { deletedAt: null }, include: { role: true } } } }),
    prisma.role.findMany({ where: { ...live, isActive: true }, orderBy: { name: "asc" } }),
  ]);

  const values: Record<string, unknown> = {};
  for (const key of Object.keys(SETTING_DEFS)) values[key] = parseSetting(key, raw[key]);
  const placeholders = new Set(values[SETTING_KEYS.gstPlaceholderIds] as string[]);

  return {
    values,
    features: resolveAppSettings(raw).features,
    company: values[SETTING_KEYS.companyProfile] as CompanyProfile,
    states: states.map((s) => ({ id: s.id, name: s.name, gstStateCode: s.gstStateCode })),
    regions: regions.map((r) => ({ id: r.id, name: r.name, code: r.code, stateId: r.stateId, isActive: r.isActive })),
    offices: offices.map((o) => ({ id: o.id, regionId: o.regionId, name: o.name, kind: o.kind, address: o.address })),
    gstins: gsts.map((g) => ({
      id: g.id, gstin: g.gstin, legalName: g.legalName, tradeName: g.tradeName, stateId: g.stateId, panNumber: g.panNumber, address: g.address,
      isActive: g.isActive, isPlaceholder: placeholders.has(g.id), regionIds: links.filter((l) => l.gstRegistrationId === g.id).map((l) => l.regionId),
    })),
    stages: stages.map((s) => ({ id: s.id, name: s.name, sequence: s.sequence, kind: s.kind, color: s.color, systemKey: s.systemKey, isActive: s.isActive })),
    tenderTypes: tenderTypes.map((t) => ({ id: t.id, name: t.name })),
    documentTypes: documentTypes.map((t) => ({ id: t.id, name: t.name })),
    checklist: checklist.map((c) => ({ id: c.id, tenderTypeId: c.tenderTypeId, documentTypeId: c.documentTypeId, isMandatory: c.isMandatory, sortOrder: c.sortOrder })),
    serviceLines: serviceLines.map((s) => ({ id: s.id, name: s.name, defaultUnit: s.defaultUnit, isActive: s.isActive })),
    approvalFlows: flows.map((f) => ({ key: f.key, name: f.name, isActive: f.isActive })),
    statutoryRates: rates.map((r) => ({
      id: r.id, code: r.code, label: r.label, unit: r.unit, value: r.value.toString(), effectiveFrom: r.effectiveFrom.toISOString().slice(0, 10),
      sourceNote: r.sourceNote, regionId: r.regionId, category: r.category, isActive: r.isActive,
    })),
    deductionTypes: deductions.map((d) => ({ id: d.id, code: d.code, name: d.name, calcMethod: d.calcMethod, defaultRate: d.defaultRate?.toString() ?? null })),
    projectStatuses: statuses.map((s) => ({ id: s.id, name: s.name, sequence: s.sequence, systemKey: s.systemKey, isActive: s.isActive })),
    users: users.map((u) => ({
      id: u.id, name: u.name, email: u.email, isActive: u.isActive, roleKey: u.roles[0]?.role.key ?? null, roleName: u.roles[0]?.role.name ?? null,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    })),
    roles: roles.map((r) => ({ key: r.key, name: r.name })),
    canResetPasswords: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    envOverride: envOverride(process.env.NEXT_PUBLIC_FEATURE_FINANCE_PAYROLL),
  };
}
