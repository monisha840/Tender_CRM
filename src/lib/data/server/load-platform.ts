/**
 * Server-only loader: notifications, audit logs, documents/links, masters (deduction types, expense
 * categories, document types, materials), settings and number series.
 *
 * `Database` keys: notifications, auditLogs, documents, documentLinks, documentTypes, expenseCategories,
 * deductionTypes, materials. `settings` and `numberSeries` have no `Database` table yet and are returned
 * as extra keys typed here (see docs/shared-changes.md).
 *
 * Mapping: AuditLog.id is BigInt -> decimal string; ActorType JOB -> "SYSTEM" (app type has USER|SYSTEM);
 * before/after Json -> object or null (non-object JSON is dropped); Document.size Int stays number;
 * Document bucket/checksum/groupId/geo are not part of the app type and are omitted.
 *
 * Scope: audit logs filtered by regionId AND projectId (rows with null region/project drop out when the
 * corresponding scope list is given). Notifications can be narrowed with `options.userId` (the server
 * should always pass the session user). Documents are not region-scoped (link-based scoping needs entity
 * ids from other slices). Audit loads are capped by `options.auditLimit` (default 2000 newest rows,
 * returned oldest-first).
 */
import type { PrismaClient } from "@prisma/client";
import type { Database } from "@/types/database";
import {
  base,
  inIds,
  iso,
  isoOrNull,
  liveWhere,
  percentOrNull,
  type BaseRow,
  type DecimalLike,
  type LoadScope,
} from "./convert";

export interface SettingRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  key: string;
  value: unknown;
  regionId?: string | null;
}
export interface NumberSeriesRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  key: string;
  gstRegistrationId?: string | null;
  financialYear: string;
  prefix: string;
  nextNumber: number;
}

export type PlatformSlice = Pick<
  Database,
  | "notifications"
  | "auditLogs"
  | "documents"
  | "documentLinks"
  | "documentTypes"
  | "expenseCategories"
  | "deductionTypes"
  | "materials"
> & { settings: SettingRecord[]; numberSeries: NumberSeriesRecord[] };

export interface LoadPlatformOptions {
  userId?: string;
  auditLimit?: number;
  /** Skip notifications and audit logs (stored notifications are dropped; the audit viewer is deferred). */
  lean?: boolean;
}

// ---- Row shapes -------------------------------------------------------------

export interface NotificationRow extends BaseRow {
  userId: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  readAt: Date | null;
  dedupeKey: string | null;
}
export interface AuditLogRow {
  id: bigint;
  occurredAt: Date;
  createdAt: Date;
  actorId: string | null;
  actorType: "USER" | "SYSTEM" | "JOB";
  action: string;
  entityType: string;
  entityId: string;
  regionId: string | null;
  projectId: string | null;
  summary: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}
export interface DocumentRow extends BaseRow {
  storageKey: string;
  fileName: string;
  mime: string;
  size: number;
  documentTypeId: string | null;
  version: number;
  uploadedById: string;
}
export interface DocumentLinkRow extends BaseRow {
  documentId: string;
  entityType: string;
  entityId: string;
}
export interface NamedActiveRow extends BaseRow {
  name: string;
  isActive: boolean;
}
export interface DeductionTypeRow extends BaseRow {
  code: string;
  name: string;
  calcMethod: "PERCENT" | "FIXED" | "MANUAL";
  defaultRate: DecimalLike | null;
  appliesTo: "SUB_BILL" | "RA_BILL" | "BOTH";
  isReleasable: boolean;
}
export interface MaterialRow extends BaseRow {
  name: string;
  unit: string;
  hsn: string | null;
}
export interface SettingRow extends BaseRow {
  key: string;
  value: unknown;
  regionId: string | null;
}
export interface NumberSeriesRow extends BaseRow {
  key: string;
  gstRegistrationId: string | null;
  financialYear: string;
  prefix: string;
  nextNumber: number;
}

// ---- Pure mappers -----------------------------------------------------------

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

export const mapNotification = (r: NotificationRow): Database["notifications"][number] => ({
  ...base(r),
  userId: r.userId,
  type: r.type,
  title: r.title,
  body: r.body,
  entityType: r.entityType,
  entityId: r.entityId,
  readAt: isoOrNull(r.readAt),
  dedupeKey: r.dedupeKey,
});

/** AuditLog has no updatedAt/deletedAt (append-only): updatedAt mirrors createdAt. */
export const mapAuditLog = (r: AuditLogRow): Database["auditLogs"][number] => ({
  id: r.id.toString(),
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.createdAt),
  deletedAt: null,
  occurredAt: iso(r.occurredAt),
  actorId: r.actorId,
  actorType: r.actorType === "USER" ? "USER" : "SYSTEM",
  action: r.action,
  entityType: r.entityType,
  entityId: r.entityId,
  regionId: r.regionId,
  projectId: r.projectId,
  summary: r.summary,
  before: asRecord(r.before),
  after: asRecord(r.after),
  reason: r.reason,
});

export const mapDocument = (r: DocumentRow): Database["documents"][number] => ({
  ...base(r),
  storageKey: r.storageKey,
  fileName: r.fileName,
  mime: r.mime,
  size: r.size,
  documentTypeId: r.documentTypeId,
  version: r.version,
  uploadedById: r.uploadedById,
});

export const mapDocumentLink = (r: DocumentLinkRow): Database["documentLinks"][number] => ({
  ...base(r),
  documentId: r.documentId,
  entityType: r.entityType,
  entityId: r.entityId,
});

export const mapNamedActive = (r: NamedActiveRow): { id: string; createdAt: string; updatedAt: string; deletedAt?: string | null; name: string; isActive: boolean } => ({
  ...base(r),
  name: r.name,
  isActive: r.isActive,
});

export const mapDeductionType = (r: DeductionTypeRow): Database["deductionTypes"][number] => ({
  ...base(r),
  code: r.code,
  name: r.name,
  calcMethod: r.calcMethod,
  defaultRate: percentOrNull(r.defaultRate),
  appliesTo: r.appliesTo,
  isReleasable: r.isReleasable,
});

export const mapMaterial = (r: MaterialRow): Database["materials"][number] => ({
  ...base(r),
  name: r.name,
  unit: r.unit,
  hsn: r.hsn,
});

export const mapSetting = (r: SettingRow): SettingRecord => ({
  ...base(r),
  key: r.key,
  value: r.value,
  regionId: r.regionId,
});

export const mapNumberSeries = (r: NumberSeriesRow): NumberSeriesRecord => ({
  ...base(r),
  key: r.key,
  gstRegistrationId: r.gstRegistrationId,
  financialYear: r.financialYear,
  prefix: r.prefix,
  nextNumber: r.nextNumber,
});

// ---- Loader -----------------------------------------------------------------

export async function loadPlatform(
  prisma: PrismaClient,
  scope?: LoadScope,
  options: LoadPlatformOptions = {},
): Promise<PlatformSlice> {
  const live = liveWhere(scope);
  const auditWhere = { regionId: inIds(scope?.regionIds), projectId: inIds(scope?.projectIds) };

  const [notifications, audit, documents, links, docTypes, expenseCats, deductionTypes, materials, settings, series] =
    await Promise.all([
      options.lean
        ? Promise.resolve([])
        : prisma.notification.findMany({ where: { ...live, userId: options.userId }, orderBy: { createdAt: "asc" } }),
      options.lean
        ? Promise.resolve([])
        : prisma.auditLog.findMany({ where: auditWhere, orderBy: { occurredAt: "desc" }, take: options.auditLimit ?? 2000 }),
      prisma.document.findMany({ where: live, orderBy: { createdAt: "asc" } }),
      prisma.documentLink.findMany({ where: live }),
      prisma.documentType.findMany({ where: live, orderBy: { name: "asc" } }),
      prisma.expenseCategory.findMany({ where: live, orderBy: { name: "asc" } }),
      prisma.deductionType.findMany({ where: live, orderBy: { code: "asc" } }),
      prisma.material.findMany({ where: live, orderBy: { name: "asc" } }),
      prisma.setting.findMany({ where: live }),
      prisma.numberSeries.findMany({ where: live }),
    ]);

  return {
    notifications: notifications.map(mapNotification),
    auditLogs: audit.reverse().map(mapAuditLog),
    documents: documents.map(mapDocument),
    documentLinks: links.map(mapDocumentLink),
    documentTypes: docTypes.map(mapNamedActive),
    expenseCategories: expenseCats.map(mapNamedActive),
    deductionTypes: deductionTypes.map(mapDeductionType),
    materials: materials.map(mapMaterial),
    settings: settings.map(mapSetting),
    numberSeries: series.map(mapNumberSeries),
  };
}
