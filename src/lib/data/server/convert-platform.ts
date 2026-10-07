/**
 * Row -> app-type conversion helpers shared by the parties / approvals / platform loaders.
 * Pure and DB-free (structural types only), so they are unit-tested with fixture rows.
 *
 * Conversions (match src/types/common.ts):
 *  - Decimal(14,2) money     -> string with 2 dp   ("23100000.00")
 *  - Decimal(7,4) percentage -> string with 4 dp   ("-3.7500")
 *  - DateTime (UTC)          -> ISO 8601 string    (IsoDateTime)
 *  - @db.Date                -> "YYYY-MM-DD"       (IsoDate)
 *  - soft delete: `deletedAt` is null for live rows; loaders exclude deleted rows unless
 *    `includeDeleted` is set, so the pure `live()` filter in src/lib/data keeps working either way.
 */
import type { BaseEntity } from "@/types/common";

/** Anything Prisma.Decimal-like (Decimal.js) exposes toFixed. */
export interface DecimalLike {
  toFixed(dp?: number): string;
}

/** Optional scope applied by the loaders (server derives it from the session via `can()` scopes). */
export interface LoadScope {
  regionIds?: string[];
  projectIds?: string[];
  /** Include soft-deleted rows (default false). */
  includeDeleted?: boolean;
}

export const money = (d: DecimalLike): string => d.toFixed(2);
export const moneyOrNull = (d: DecimalLike | null | undefined): string | null => (d == null ? null : d.toFixed(2));
export const percent = (d: DecimalLike): string => d.toFixed(4);
export const percentOrNull = (d: DecimalLike | null | undefined): string | null => (d == null ? null : d.toFixed(4));

export const iso = (d: Date): string => d.toISOString();
export const isoOrNull = (d: Date | null | undefined): string | null => (d == null ? null : d.toISOString());
/** Date-only column: use the UTC calendar day (Prisma returns @db.Date as midnight UTC). */
export const isoDate = (d: Date): string => d.toISOString().slice(0, 10);
export const isoDateOrNull = (d: Date | null | undefined): string | null => (d == null ? null : d.toISOString().slice(0, 10));

export interface BaseRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
}

/** id + audit timestamps of BaseEntity. */
export const base = (r: BaseRow): BaseEntity => ({
  id: r.id,
  createdAt: iso(r.createdAt),
  updatedAt: iso(r.updatedAt),
  deletedAt: isoOrNull(r.deletedAt),
});

/** Prisma `where` fragment for soft delete. */
export const liveWhere = (scope?: LoadScope): { deletedAt?: null } => (scope?.includeDeleted ? {} : { deletedAt: null });

/** `{ in: ids }` when a list is supplied, otherwise undefined (no filter). */
export const inIds = (ids?: string[]): { in: string[] } | undefined => (ids ? { in: ids } : undefined);
