// Server-only helpers that turn Prisma rows into the string/ISO forms used by `src/types` and the seed.
// Conversions (documented once, used by every loader):
//   Decimal(14,2) money   -> "23100000.00"  (toFixed(2))
//   Decimal(14,3) qty     -> "125.000"      (toFixed(3))
//   Decimal(7,4) percent  -> "-3.7500"      (toFixed(4))
//   DateTime              -> ISO 8601 UTC, `toISOString()` (same as the seed's `istToUtc`)
//   @db.Date              -> "YYYY-MM-DD" (Prisma returns UTC midnight)
//   soft-deleted rows are NOT filtered here: they are returned with `deletedAt` set, and the pure
//   readers drop them via `live()`. Scope filters are applied in the query.
import type { IsoDate, IsoDateTime } from "@/types";

/** Structural stand-in for Prisma.Decimal so mappers can be tested without a database. */
export interface DecimalLike {
  toFixed(decimalPlaces?: number): string;
}

export const money = (d: DecimalLike): string => d.toFixed(2);
export const qty = (d: DecimalLike): string => d.toFixed(3);
export const pct = (d: DecimalLike): string => d.toFixed(4);
export const moneyOrNull = (d: DecimalLike | null | undefined): string | null => (d == null ? null : money(d));

export const ts = (d: Date): IsoDateTime => d.toISOString();
export const tsOrNull = (d: Date | null | undefined): IsoDateTime | null => (d == null ? null : d.toISOString());
export const day = (d: Date): IsoDate => d.toISOString().slice(0, 10);
export const dayOrNull = (d: Date | null | undefined): IsoDate | null => (d == null ? null : day(d));

interface BaseRow {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
/** The `BaseEntity` columns every table shares. */
export const base = (r: BaseRow) => ({
  id: r.id,
  createdAt: ts(r.createdAt),
  updatedAt: ts(r.updatedAt),
  deletedAt: tsOrNull(r.deletedAt),
});

/** Optional scope applied in the queries. Omitted arrays mean "no restriction". */
export interface LoadScope {
  regionIds?: string[];
  projectIds?: string[];
  siteIds?: string[];
}

export const inIds = (ids: string[] | undefined) => (ids ? { in: ids } : undefined);
