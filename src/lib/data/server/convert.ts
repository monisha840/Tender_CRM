// Server-only: THE single set of Prisma row -> app-type conversion helpers and query-scope helpers.
// Conversions (match src/types/common.ts and the seed):
//   Decimal(14,2) money     -> "23100000.00"  (toFixed(2); never toString, which drops trailing zeros)
//   Decimal(14,3) quantity  -> "125.000"      (toFixed(3))
//   Decimal(7,4) percentage -> "-3.7500"      (toFixed(4))
//   Small decimals typed `number` (dayFraction, daysWorked) -> JS number
//   DateTime                -> ISO 8601 UTC string
//   @db.Date                -> "YYYY-MM-DD" (UTC calendar day; Prisma returns UTC midnight)
//   Soft delete: loaders exclude deleted rows unless `scope.includeDeleted`; `deletedAt` is mapped through.
import type { BaseEntity, IsoDate, IsoDateTime } from "@/types";

/** Structural stand-in for Prisma.Decimal so mappers are testable without a database. */
export interface DecimalLike {
  toFixed(decimalPlaces?: number): string;
}

const isDecimalLike = (v: unknown): v is DecimalLike =>
  typeof v === "object" && v !== null && typeof (v as DecimalLike).toFixed === "function";

/** Lenient decimal formatter used by the spec-driven mapper (accepts Decimal, number, numeric string). */
export function fixed(v: unknown, digits: number): string {
  if (v === null || v === undefined) throw new Error("Expected a decimal value, got null");
  if (isDecimalLike(v)) return v.toFixed(digits);
  if (typeof v === "number") return v.toFixed(digits);
  if (typeof v === "string") {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`Invalid decimal: ${v}`);
    return n.toFixed(digits);
  }
  throw new Error(`Invalid decimal: ${String(v)}`);
}
export const toMoney = (v: unknown): string => fixed(v, 2);
export const toQty = (v: unknown): string => fixed(v, 3);
export const toPercent = (v: unknown): string => fixed(v, 4);
export const toNumber = (v: unknown): number => Number(fixed(v, 4));

export const money = (d: DecimalLike): string => d.toFixed(2);
export const moneyOrNull = (d: DecimalLike | null | undefined): string | null => (d == null ? null : money(d));
export const qty = (d: DecimalLike): string => d.toFixed(3);
export const pct = (d: DecimalLike): string => d.toFixed(4);
export const pctOrNull = (d: DecimalLike | null | undefined): string | null => (d == null ? null : pct(d));

export const ts = (d: Date): IsoDateTime => d.toISOString();
export const tsOrNull = (d: Date | null | undefined): IsoDateTime | null => (d == null ? null : ts(d));
export const day = (d: Date): IsoDate => d.toISOString().slice(0, 10);
export const dayOrNull = (d: Date | null | undefined): IsoDate | null => (d == null ? null : day(d));

const asDate = (v: unknown): Date => {
  const d = v instanceof Date ? v : new Date(v as string);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${String(v)}`);
  return d;
};
export const toIsoDate = (v: unknown): string => day(asDate(v));
export const toIsoDateTime = (v: unknown): string => ts(asDate(v));

// Legacy-name aliases kept so loader modules read naturally.
export const percent = pct;
export const percentOrNull = pctOrNull;
export const iso = ts;
export const isoOrNull = tsOrNull;
export const isoDate = day;
export const isoDateOrNull = dayOrNull;
export const isoDateTime = ts;

export interface BaseRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  version?: number | null;
  createdById?: string | null;
  updatedById?: string | null;
  clientUuid?: string | null;
}

/** BaseEntity columns (id, timestamps, soft delete, plus optional audit/sync columns when the row has them). */
export function base(r: BaseRow): BaseEntity {
  const out: BaseEntity = { id: r.id, createdAt: ts(r.createdAt), updatedAt: ts(r.updatedAt), deletedAt: tsOrNull(r.deletedAt) };
  if (r.version != null) out.version = r.version;
  if (r.createdById != null) out.createdById = r.createdById;
  if (r.updatedById != null) out.updatedById = r.updatedById;
  if (r.clientUuid != null) out.clientUuid = r.clientUuid;
  return out;
}

/** The ONE scope type for every loader. Omitted arrays mean "no restriction". */
export interface LoadScope {
  regionIds?: string[];
  projectIds?: string[];
  siteIds?: string[];
  /** Include soft-deleted rows (default false). */
  includeDeleted?: boolean;
}

export const inIds = (ids?: string[]): { in: string[] } | undefined => (ids ? { in: ids } : undefined);
/** Prisma `where` fragment for soft delete. */
export const liveWhere = (scope?: LoadScope): { deletedAt?: null } => (scope?.includeDeleted ? {} : { deletedAt: null });
export const LIVE = { deletedAt: null } as const;
export const live = LIVE;
export const byRegion = (scope?: LoadScope): Record<string, unknown> => (scope?.regionIds ? { regionId: { in: scope.regionIds } } : {});
export const byProject = (scope?: LoadScope): Record<string, unknown> => (scope?.projectIds ? { projectId: { in: scope.projectIds } } : {});

/** Stable ordering so snapshots and tests are deterministic. */
export const STABLE_ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }];
