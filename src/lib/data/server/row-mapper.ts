// Server-only helpers: convert Prisma rows into the plain `Database` entity shapes.
//
// Conversion conventions (match src/types/common.ts and the seed):
//  - Decimal(14,2) money      -> string with 2 decimals ("23100000.00"); never a JS number.
//  - Decimal(14,3) quantity   -> string with 3 decimals ("12.000").
//  - Decimal(7,4) percentage  -> string with 4 decimals ("18.0000").
//  - Small decimals the types declare as `number` (dayFraction, daysWorked) -> JS number.
//  - @db.Date                 -> "YYYY-MM-DD" (UTC calendar day).
//  - DateTime timestamps      -> ISO 8601 UTC string.
//  - Soft delete: loaders only select rows with deletedAt = null, so mapped entities carry
//    `deletedAt: null`. Audit columns (createdById, updatedById, version) are not exposed.

export { fixed, toMoney, toQty, toPercent, toNumber, toIsoDate, toIsoDateTime } from "./convert";
import { toMoney, toQty, toPercent, toNumber, toIsoDate, toIsoDateTime } from "./convert";

/** Per-entity field lists. Fields listed in `optional` map null/undefined to null. */
export interface RowSpec {
  str?: string[];
  bool?: string[];
  int?: string[];
  money?: string[];
  qty?: string[];
  pct?: string[];
  num?: string[];
  date?: string[];
  ts?: string[];
  optional?: string[];
}

type Row = Record<string, unknown>;

export function mapRow<T>(row: Row, spec: RowSpec): T {
  const optional = new Set(spec.optional ?? []);
  const out: Row = {
    id: row.id,
    createdAt: toIsoDateTime(row.createdAt),
    updatedAt: toIsoDateTime(row.updatedAt),
    deletedAt: row.deletedAt ? toIsoDateTime(row.deletedAt) : null,
  };
  const apply = (names: string[] | undefined, fn: (v: unknown) => unknown) => {
    for (const n of names ?? []) {
      const v = row[n];
      out[n] = v === null || v === undefined ? (optional.has(n) ? null : fn(v)) : fn(v);
    }
  };
  const same = (v: unknown) => v;
  apply(spec.str, same);
  apply(spec.bool, same);
  apply(spec.int, same);
  apply(spec.money, toMoney);
  apply(spec.qty, toQty);
  apply(spec.pct, toPercent);
  apply(spec.num, toNumber);
  apply(spec.date, toIsoDate);
  apply(spec.ts, toIsoDateTime);
  return out as T;
}

