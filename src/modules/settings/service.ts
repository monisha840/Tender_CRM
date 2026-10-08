import "server-only";
import { Prisma } from "@prisma/client";
import { runAction, ServiceError, updateWithVersion, type ActionContext } from "@/lib/server/service";
import type { Tx } from "@/lib/server/audit";
import { gstinStateCode } from "@/lib/gst-validation";
import {
  approvalRulesSchema, checklistItemSchema, checklistRemoveSchema, checklistToggleSchema, deductionRateSchema, gstinSchema, officeSchema,
  projectStatusSchema, regionSchema, reorderSchema, serviceLineSchema, setHealthSchema, setSettingSchema, stageSchema, statutoryActiveSchema,
  statutoryRateSchema, userResetSchema, userUpdateSchema,
} from "./schema";
import { SETTING_KEYS, healthThresholdError, validateSetting } from "./keys";
import { isPermutation, sequencesFor } from "./reorder";

const MODULE = "settings";
const nameKey = (s: string) => s.trim().toLowerCase();
const toDate = (d: string) => new Date(`${d}T00:00:00.000Z`);

/** Upsert a global Setting row (regionId null). Returns the previous stored value (undefined when unset). */
export async function writeSetting(tx: Tx, key: string, value: unknown, userId: string): Promise<{ before: unknown }> {
  const json = value as Prisma.InputJsonValue;
  const row = await tx.setting.findFirst({ where: { key, regionId: null, deletedAt: null } });
  if (row) {
    await tx.setting.update({ where: { id: row.id }, data: { value: json, updatedById: userId, version: { increment: 1 } } });
    return { before: row.value };
  }
  await tx.setting.create({ data: { key, value: json, regionId: null, createdById: userId, updatedById: userId } });
  return { before: undefined };
}

async function readSetting(tx: Tx, key: string): Promise<unknown> {
  return (await tx.setting.findFirst({ where: { key, regionId: null, deletedAt: null }, select: { value: true } }))?.value;
}

// ---------------------------------------------------------------------------------------------------------------
// Generic Setting key (reminders, billing, features, company profile, units, ...)
// ---------------------------------------------------------------------------------------------------------------

export const setSetting = runAction({ schema: setSettingSchema, module: MODULE, action: "EDIT" }, async ({ tx, user, input, audit }) => {
  const checked = validateSetting(input.key, input.value);
  if (!checked.ok) throw new ServiceError("VALIDATION", checked.error);
  // Cross-field rule for the two health thresholds: the stored partner value must stay consistent.
  if (input.key === SETTING_KEYS.healthAmberDelayPct || input.key === SETTING_KEYS.healthRedDelayPct) {
    const amberStored = (await readSetting(tx, SETTING_KEYS.healthAmberDelayPct)) as number | undefined;
    const redStored = (await readSetting(tx, SETTING_KEYS.healthRedDelayPct)) as number | undefined;
    const amber = input.key === SETTING_KEYS.healthAmberDelayPct ? (checked.value as number) : (amberStored ?? 5);
    const red = input.key === SETTING_KEYS.healthRedDelayPct ? (checked.value as number) : (redStored ?? 15);
    const err = healthThresholdError(amber, red);
    if (err) throw new ServiceError("VALIDATION", err);
  }
  const { before } = await writeSetting(tx, input.key, checked.value, user.id);
  await audit({ action: "settings.set", entityType: "Setting", entityId: input.key, before: { value: before ?? null }, after: { value: checked.value }, summary: `Setting ${input.key} changed` });
  return { key: input.key };
});

export const setHealthThresholds = runAction({ schema: setHealthSchema, module: MODULE, action: "EDIT" }, async ({ tx, user, input, audit }) => {
  const err = healthThresholdError(input.amber, input.red);
  if (err) throw new ServiceError("VALIDATION", err);
  const a = await writeSetting(tx, SETTING_KEYS.healthAmberDelayPct, input.amber, user.id);
  const r = await writeSetting(tx, SETTING_KEYS.healthRedDelayPct, input.red, user.id);
  await audit({
    action: "settings.set", entityType: "Setting", entityId: "health.thresholds",
    before: { amber: a.before ?? null, red: r.before ?? null }, after: { amber: input.amber, red: input.red }, summary: "Project health thresholds changed",
  });
  return { amber: input.amber, red: input.red };
});

export const saveApprovalRules = runAction({ schema: approvalRulesSchema, module: MODULE, action: "EDIT", reasonRequired: true }, async ({ tx, user, input, audit }) => {
  const m = await writeSetting(tx, SETTING_KEYS.approvalsMakerChecker, input.makerChecker, user.id);
  const d = await writeSetting(tx, SETTING_KEYS.approvalsDueDays, input.dueDays, user.id);
  const q = await writeSetting(tx, SETTING_KEYS.approvalsRequired, input.required, user.id);
  await audit({
    action: "settings.approval_rules.set", entityType: "Setting", entityId: "approvals.*",
    before: { makerChecker: m.before ?? null, dueDays: d.before ?? null, required: q.before ?? null },
    after: { makerChecker: input.makerChecker, dueDays: input.dueDays, required: input.required }, summary: "Approval rules changed",
  });
  return {};
});

// ---------------------------------------------------------------------------------------------------------------
// Regions, offices, GSTINs
// ---------------------------------------------------------------------------------------------------------------

export const saveRegion = runAction({ schema: regionSchema, module: MODULE, action: "EDIT" }, async ({ tx, input, audit, user }) => {
  const dupe = await tx.region.findFirst({ where: { code: input.code, deletedAt: null, NOT: input.id ? { id: input.id } : undefined } });
  if (dupe) throw new ServiceError("CONFLICT", `Region code ${input.code} is already used`);
  if (!(await tx.state.findFirst({ where: { id: input.stateId, deletedAt: null } }))) throw new ServiceError("VALIDATION", "Choose a valid state");
  if (input.id) {
    const before = await tx.region.findFirst({ where: { id: input.id, deletedAt: null } });
    if (!before) throw new ServiceError("NOT_FOUND", "Region not found");
    await updateWithVersion(tx.region, input.id, before.version, { name: input.name, code: input.code, stateId: input.stateId, isActive: input.isActive, updatedById: user.id });
    await audit({ action: "settings.region.edit", entityType: "Region", entityId: input.id, before: pick(before, ["name", "code", "stateId", "isActive"]), after: pick(input, ["name", "code", "stateId", "isActive"]), regionId: input.id });
    return { id: input.id };
  }
  const created = await tx.region.create({ data: { name: input.name, code: input.code, stateId: input.stateId, isActive: input.isActive, createdById: user.id, updatedById: user.id } });
  await audit({ action: "settings.region.create", entityType: "Region", entityId: created.id, after: pick(created, ["name", "code", "stateId", "isActive"]), regionId: created.id });
  return { id: created.id };
});

export const saveOffice = runAction({ schema: officeSchema, module: MODULE, action: "EDIT" }, async ({ tx, input, audit, user }) => {
  if (input.id) {
    const before = await tx.office.findFirst({ where: { id: input.id, deletedAt: null } });
    if (!before) throw new ServiceError("NOT_FOUND", "Office not found");
    await updateWithVersion(tx.office, input.id, before.version, { name: input.name, kind: input.kind, address: input.address, regionId: input.regionId, updatedById: user.id });
    await audit({ action: "settings.office.edit", entityType: "Office", entityId: input.id, before: pick(before, ["name", "kind", "address", "regionId"]), after: pick(input, ["name", "kind", "address", "regionId"]), regionId: input.regionId });
    return { id: input.id };
  }
  const created = await tx.office.create({ data: { name: input.name, kind: input.kind, address: input.address, regionId: input.regionId, createdById: user.id, updatedById: user.id } });
  await audit({ action: "settings.office.create", entityType: "Office", entityId: created.id, after: pick(created, ["name", "kind", "address", "regionId"]), regionId: input.regionId });
  return { id: created.id };
});

export const saveGstin = runAction({ schema: gstinSchema, module: MODULE, action: "EDIT" }, async ({ tx, input, audit, user }) => {
  const state = await tx.state.findFirst({ where: { id: input.stateId, deletedAt: null } });
  if (!state) throw new ServiceError("VALIDATION", "Choose a valid state");
  if (gstinStateCode(input.gstin) !== state.gstStateCode) throw new ServiceError("VALIDATION", `GSTIN starts with ${gstinStateCode(input.gstin)} but ${state.name} uses ${state.gstStateCode}`);
  const dupe = await tx.gstRegistration.findFirst({ where: { gstin: input.gstin, deletedAt: null, NOT: input.id ? { id: input.id } : undefined } });
  if (dupe) throw new ServiceError("CONFLICT", "This GSTIN is already registered");
  const data = { gstin: input.gstin, legalName: input.legalName, tradeName: input.tradeName || null, stateId: input.stateId, panNumber: input.panNumber, address: input.address, isActive: input.isActive };
  let gid = input.id;
  let before: unknown = undefined;
  if (gid) {
    const row = await tx.gstRegistration.findFirst({ where: { id: gid, deletedAt: null } });
    if (!row) throw new ServiceError("NOT_FOUND", "GSTIN not found");
    before = pick(row, ["gstin", "legalName", "tradeName", "stateId", "panNumber", "address", "isActive"]);
    await updateWithVersion(tx.gstRegistration, gid, row.version, { ...data, updatedById: user.id });
  } else {
    gid = (await tx.gstRegistration.create({ data: { ...data, createdById: user.id, updatedById: user.id } })).id;
  }
  if (input.regionId) {
    const link = await tx.regionGstRegistration.findFirst({ where: { regionId: input.regionId, gstRegistrationId: gid, deletedAt: null } });
    if (!link) await tx.regionGstRegistration.create({ data: { regionId: input.regionId, gstRegistrationId: gid, createdById: user.id, updatedById: user.id } });
  }
  // Placeholder marker lives in a Setting (list of GstRegistration ids).
  const ids = ((await readSetting(tx, SETTING_KEYS.gstPlaceholderIds)) as string[] | undefined) ?? [];
  const next = input.isPlaceholder ? [...new Set([...ids, gid])] : ids.filter((x) => x !== gid);
  if (next.length !== ids.length || next.some((x, i) => x !== ids[i])) await writeSetting(tx, SETTING_KEYS.gstPlaceholderIds, next, user.id);
  await audit({
    action: input.id ? "settings.gstin.edit" : "settings.gstin.create", entityType: "GstRegistration", entityId: gid,
    before, after: { ...data, isPlaceholder: input.isPlaceholder }, regionId: input.regionId ?? null,
  });
  return { id: gid };
});

// ---------------------------------------------------------------------------------------------------------------
// Tender stages
// ---------------------------------------------------------------------------------------------------------------

export const saveStage = runAction({ schema: stageSchema, module: MODULE, action: "EDIT" }, async ({ tx, input, audit, user }) => {
  const all = await tx.tenderStage.findMany({ where: { deletedAt: null } });
  if (all.some((s) => s.id !== input.id && nameKey(s.name) === nameKey(input.name))) throw new ServiceError("CONFLICT", "A stage with this name already exists");
  if (input.id) {
    const row = all.find((s) => s.id === input.id);
    if (!row) throw new ServiceError("NOT_FOUND", "Stage not found");
    if (row.systemKey && (input.kind !== row.kind || !input.isActive)) throw new ServiceError("VALIDATION", "System stages can be renamed and recoloured but not deactivated or given another meaning");
    await updateWithVersion(tx.tenderStage, row.id, row.version, { name: input.name, kind: input.kind, color: input.color, isActive: input.isActive, updatedById: user.id });
    await audit({ action: "settings.stage.edit", entityType: "TenderStage", entityId: row.id, before: pick(row, ["name", "kind", "color", "isActive"]), after: pick(input, ["name", "kind", "color", "isActive"]) });
    return { id: row.id };
  }
  const sequence = Math.max(0, ...all.map((s) => s.sequence)) + 1;
  const created = await tx.tenderStage.create({ data: { name: input.name, kind: input.kind, color: input.color, isActive: input.isActive, sequence, createdById: user.id, updatedById: user.id } });
  await audit({ action: "settings.stage.create", entityType: "TenderStage", entityId: created.id, after: { ...pick(created, ["name", "kind", "color", "isActive"]), sequence } });
  return { id: created.id };
});

/** Re-sequence a list-with-sequence table to match `orderedIds`. Shared by tender stages and project statuses. */
async function reorderTable(tx: Tx, table: "tenderStage" | "projectStatus", orderedIds: string[], entityType: string, audit: ActionContext<unknown>["audit"]) {
  const delegate = (table === "tenderStage" ? tx.tenderStage : tx.projectStatus) as unknown as {
    findMany(a: unknown): Promise<{ id: string; sequence: number }[]>;
    update(a: unknown): Promise<unknown>;
  };
  const rows = await delegate.findMany({ where: { deletedAt: null }, orderBy: { sequence: "asc" } });
  const current = rows.map((r) => r.id);
  if (!isPermutation(current, orderedIds)) throw new ServiceError("CONFLICT", "The list changed while you were reordering. Reload and try again.");
  for (const { id, sequence } of sequencesFor(orderedIds)) await delegate.update({ where: { id }, data: { sequence, version: { increment: 1 } } });
  await audit({ action: `settings.${table === "tenderStage" ? "stage" : "project_status"}.reorder`, entityType, entityId: "order", before: { order: current }, after: { order: orderedIds }, summary: `${entityType} order changed` });
}

export const reorderStages = runAction({ schema: reorderSchema, module: MODULE, action: "EDIT" }, async ({ tx, input, audit }) => {
  await reorderTable(tx, "tenderStage", input.orderedIds, "TenderStage", audit);
  return {};
});

// ---------------------------------------------------------------------------------------------------------------
// Checklist templates
// ---------------------------------------------------------------------------------------------------------------

export const addChecklistItem = runAction({ schema: checklistItemSchema, module: MODULE, action: "EDIT" }, async ({ tx, input, audit, user }) => {
  if (!(await tx.tenderType.findFirst({ where: { id: input.tenderTypeId, deletedAt: null } }))) throw new ServiceError("NOT_FOUND", "Tender type not found");
  let documentTypeId = input.documentTypeId;
  if (!documentTypeId) {
    const newName = input.newDocumentTypeName?.trim();
    if (!newName) throw new ServiceError("VALIDATION", "Choose a document or type a new document name");
    const existing = await tx.documentType.findFirst({ where: { name: { equals: newName, mode: "insensitive" }, deletedAt: null } });
    documentTypeId = existing?.id ?? (await tx.documentType.create({ data: { name: newName, createdById: user.id, updatedById: user.id } })).id;
  }
  const dupe = await tx.checklistTemplateItem.findFirst({ where: { tenderTypeId: input.tenderTypeId, documentTypeId } });
  if (dupe && !dupe.deletedAt) throw new ServiceError("CONFLICT", "This document is already on the checklist");
  const last = await tx.checklistTemplateItem.aggregate({ where: { tenderTypeId: input.tenderTypeId, deletedAt: null }, _max: { sortOrder: true } });
  const sortOrder = (last._max.sortOrder ?? 0) + 1;
  const row = dupe
    ? await tx.checklistTemplateItem.update({ where: { id: dupe.id }, data: { deletedAt: null, isMandatory: input.isMandatory, sortOrder, updatedById: user.id, version: { increment: 1 } } })
    : await tx.checklistTemplateItem.create({ data: { tenderTypeId: input.tenderTypeId, documentTypeId, isMandatory: input.isMandatory, sortOrder, createdById: user.id, updatedById: user.id } });
  await audit({ action: "settings.checklist.create", entityType: "ChecklistTemplateItem", entityId: row.id, after: { tenderTypeId: input.tenderTypeId, documentTypeId, isMandatory: input.isMandatory } });
  return { id: row.id };
});

export const toggleChecklistMandatory = runAction({ schema: checklistToggleSchema, module: MODULE, action: "EDIT" }, async ({ tx, input, audit, user }) => {
  const row = await tx.checklistTemplateItem.findFirst({ where: { id: input.id, deletedAt: null } });
  if (!row) throw new ServiceError("NOT_FOUND", "Checklist item not found");
  await updateWithVersion(tx.checklistTemplateItem, row.id, row.version, { isMandatory: input.isMandatory, updatedById: user.id });
  await audit({ action: "settings.checklist.edit", entityType: "ChecklistTemplateItem", entityId: row.id, before: { isMandatory: row.isMandatory }, after: { isMandatory: input.isMandatory } });
  return {};
});

export const removeChecklistItem = runAction({ schema: checklistRemoveSchema, module: MODULE, action: "EDIT" }, async ({ tx, input, audit, user }) => {
  const row = await tx.checklistTemplateItem.findFirst({ where: { id: input.id, deletedAt: null } });
  if (!row) throw new ServiceError("NOT_FOUND", "Checklist item not found");
  await tx.checklistTemplateItem.update({ where: { id: row.id }, data: { deletedAt: new Date(), updatedById: user.id, version: { increment: 1 } } });
  await audit({ action: "settings.checklist.delete", entityType: "ChecklistTemplateItem", entityId: row.id, before: pick(row, ["tenderTypeId", "documentTypeId", "isMandatory"]) });
  return {};
});

// ---------------------------------------------------------------------------------------------------------------
// Service lines, deduction types, project statuses
// ---------------------------------------------------------------------------------------------------------------

export const saveServiceLine = runAction({ schema: serviceLineSchema, module: MODULE, action: "EDIT" }, async ({ tx, input, audit, user }) => {
  const all = await tx.serviceLine.findMany({ where: { deletedAt: null } });
  if (all.some((s) => s.id !== input.id && nameKey(s.name) === nameKey(input.name))) throw new ServiceError("CONFLICT", "A service line with this name already exists");
  if (input.id) {
    const row = all.find((s) => s.id === input.id);
    if (!row) throw new ServiceError("NOT_FOUND", "Service line not found");
    await updateWithVersion(tx.serviceLine, row.id, row.version, { name: input.name, defaultUnit: input.defaultUnit, isActive: input.isActive, updatedById: user.id });
    await audit({ action: "settings.service_line.edit", entityType: "ServiceLine", entityId: row.id, before: pick(row, ["name", "defaultUnit", "isActive"]), after: pick(input, ["name", "defaultUnit", "isActive"]) });
    return { id: row.id };
  }
  const created = await tx.serviceLine.create({ data: { name: input.name, defaultUnit: input.defaultUnit, isActive: input.isActive, createdById: user.id, updatedById: user.id } });
  await audit({ action: "settings.service_line.create", entityType: "ServiceLine", entityId: created.id, after: pick(created, ["name", "defaultUnit", "isActive"]) });
  return { id: created.id };
});

export const setDeductionRate = runAction({ schema: deductionRateSchema, module: MODULE, action: "EDIT", reasonRequired: true }, async ({ tx, input, audit, user }) => {
  const row = await tx.deductionType.findFirst({ where: { id: input.id, deletedAt: null } });
  if (!row) throw new ServiceError("NOT_FOUND", "Deduction type not found");
  if (row.calcMethod !== "PERCENT") throw new ServiceError("VALIDATION", "Only percentage deductions have a default rate");
  await updateWithVersion(tx.deductionType, row.id, row.version, { defaultRate: new Prisma.Decimal(input.defaultRate), updatedById: user.id });
  await audit({ action: "settings.deduction_rate.set", entityType: "DeductionType", entityId: row.id, before: { defaultRate: row.defaultRate?.toString() ?? null }, after: { defaultRate: input.defaultRate }, summary: `${row.name} default rate ${row.defaultRate?.toString() ?? "-"}% to ${input.defaultRate}%` });
  return {};
});

export const saveProjectStatus = runAction({ schema: projectStatusSchema, module: MODULE, action: "EDIT" }, async ({ tx, input, audit, user }) => {
  const all = await tx.projectStatus.findMany({ where: { deletedAt: null } });
  if (all.some((s) => s.id !== input.id && nameKey(s.name) === nameKey(input.name))) throw new ServiceError("CONFLICT", "A status with this name already exists");
  if (input.id) {
    const row = all.find((s) => s.id === input.id);
    if (!row) throw new ServiceError("NOT_FOUND", "Status not found");
    if (row.systemKey && !input.isActive) throw new ServiceError("VALIDATION", "System statuses can be renamed but not deactivated");
    await updateWithVersion(tx.projectStatus, row.id, row.version, { name: input.name, isActive: input.isActive, updatedById: user.id });
    await audit({ action: "settings.project_status.edit", entityType: "ProjectStatus", entityId: row.id, before: pick(row, ["name", "isActive"]), after: pick(input, ["name", "isActive"]) });
    return { id: row.id };
  }
  const sequence = Math.max(0, ...all.map((s) => s.sequence)) + 1;
  const created = await tx.projectStatus.create({ data: { name: input.name, isActive: input.isActive, sequence, createdById: user.id, updatedById: user.id } });
  await audit({ action: "settings.project_status.create", entityType: "ProjectStatus", entityId: created.id, after: { name: input.name, isActive: input.isActive, sequence } });
  return { id: created.id };
});

export const reorderProjectStatuses = runAction({ schema: reorderSchema, module: MODULE, action: "EDIT" }, async ({ tx, input, audit }) => {
  await reorderTable(tx, "projectStatus", input.orderedIds, "ProjectStatus", audit);
  return {};
});

// ---------------------------------------------------------------------------------------------------------------
// Statutory rates (history is kept: a change is a NEW dated row, never an edit)
// ---------------------------------------------------------------------------------------------------------------

export const addStatutoryRate = runAction({ schema: statutoryRateSchema, module: MODULE, action: "EDIT", reasonRequired: true }, async ({ tx, input, audit, user }) => {
  const same = await tx.statutoryRate.findFirst({
    where: { code: input.code, effectiveFrom: toDate(input.effectiveFrom), regionId: input.regionId ?? null, category: input.category || null, deletedAt: null },
  });
  if (same) throw new ServiceError("CONFLICT", "A rate for this code already starts on that date. Pick a later effective date.");
  const created = await tx.statutoryRate.create({
    data: {
      code: input.code, label: input.label, unit: input.unit, value: new Prisma.Decimal(input.value), effectiveFrom: toDate(input.effectiveFrom),
      sourceNote: input.sourceNote || null, regionId: input.regionId ?? null, category: input.category || null, createdById: user.id, updatedById: user.id,
    },
  });
  await audit({ action: "settings.statutory_rate.add", entityType: "StatutoryRate", entityId: created.id, after: { code: input.code, unit: input.unit, value: input.value, effectiveFrom: input.effectiveFrom, sourceNote: input.sourceNote ?? null } });
  return { id: created.id };
});

export const setStatutoryRateActive = runAction({ schema: statutoryActiveSchema, module: MODULE, action: "EDIT", reasonRequired: true }, async ({ tx, input, audit, user }) => {
  const row = await tx.statutoryRate.findFirst({ where: { id: input.id, deletedAt: null } });
  if (!row) throw new ServiceError("NOT_FOUND", "Rate not found");
  await updateWithVersion(tx.statutoryRate, row.id, row.version, { isActive: input.isActive, updatedById: user.id });
  await audit({ action: "settings.statutory_rate.active", entityType: "StatutoryRate", entityId: row.id, before: { isActive: row.isActive }, after: { isActive: input.isActive } });
  return {};
});

// ---------------------------------------------------------------------------------------------------------------
// Users and roles (module "users")
// ---------------------------------------------------------------------------------------------------------------

export const updateUser = runAction({ schema: userUpdateSchema, module: "users", action: "EDIT" }, async ({ tx, input, audit, user }) => {
  const target = await tx.user.findFirst({ where: { id: input.id, deletedAt: null }, include: { roles: { where: { deletedAt: null }, include: { role: true } } } });
  if (!target) throw new ServiceError("NOT_FOUND", "User not found");
  const role = await tx.role.findFirst({ where: { key: input.roleKey, isActive: true, deletedAt: null } });
  if (!role) throw new ServiceError("VALIDATION", "Choose a valid role");
  const oldKeys = target.roles.map((r) => r.role.key);
  if (target.id === user.id && (!input.isActive || input.roleKey !== oldKeys[0])) throw new ServiceError("VALIDATION", "You cannot change your own role or deactivate yourself");
  if (oldKeys.includes("system_admin") && (!input.isActive || input.roleKey !== "system_admin")) {
    const others = await tx.user.count({ where: { id: { not: target.id }, isActive: true, deletedAt: null, roles: { some: { deletedAt: null, role: { key: "system_admin" } } } } });
    if (others === 0) throw new ServiceError("VALIDATION", "There must be at least one active System Admin");
  }
  await updateWithVersion(tx.user, target.id, target.version, { name: input.name, isActive: input.isActive, updatedById: user.id });
  for (const r of target.roles) if (r.role.key !== input.roleKey) await tx.userRole.update({ where: { id: r.id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
  if (!oldKeys.includes(input.roleKey)) {
    const old = await tx.userRole.findUnique({ where: { userId_roleId: { userId: target.id, roleId: role.id } } });
    if (old) await tx.userRole.update({ where: { id: old.id }, data: { deletedAt: null, version: { increment: 1 } } });
    else await tx.userRole.create({ data: { userId: target.id, roleId: role.id, createdById: user.id, updatedById: user.id } });
  }
  await audit({
    action: "settings.user.edit", entityType: "User", entityId: target.id,
    before: { name: target.name, isActive: target.isActive, roles: oldKeys }, after: { name: input.name, isActive: input.isActive, roles: [input.roleKey] },
  });
  return {};
});

export const sendPasswordReset = runAction({ schema: userResetSchema, module: "users", action: "EDIT" }, async ({ tx, input, audit }) => {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new ServiceError("VALIDATION", "Password reset needs the Supabase service-role key, which is not configured on this server");
  const target = await tx.user.findFirst({ where: { id: input.id, deletedAt: null, isActive: true } });
  if (!target) throw new ServiceError("NOT_FOUND", "User not found or inactive");
  const { createServiceClient } = await import("@/lib/supabase/server");
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
  const { error } = await createServiceClient().auth.resetPasswordForEmail(target.email, origin ? { redirectTo: `${origin}/auth/callback?next=/reset-password` } : undefined);
  if (error) throw new ServiceError("VALIDATION", `Could not send the reset email: ${error.message}`);
  await audit({ action: "settings.user.password_reset", entityType: "User", entityId: target.id, summary: `Password reset email sent to ${target.email}` });
  return {};
});

function pick<T extends object>(o: T, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = (o as Record<string, unknown>)[k] ?? null;
  return out;
}
