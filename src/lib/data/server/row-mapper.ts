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

export interface DecimalLike {
  toFixed(digits?: number): string;
}

const isDecimalLike = (v: unknown): v is DecimalLike =>
  typeof v === "object" && v !== null && typeof (v as DecimalLike).toFixed === "function";

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

const asDate = (v: unknown): Date => {
  const d = v instanceof Date ? v : new Date(v as string);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${String(v)}`);
  return d;
};
export const toIsoDate = (v: unknown): string => asDate(v).toISOString().slice(0, 10);
export const toIsoDateTime = (v: unknown): string => asDate(v).toISOString();

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

/** Row selection scope. Omitted = everything (Director / admin). Filters only where the table has the column. */
export interface LoadScope {
  regionIds?: string[];
  projectIds?: string[];
}

/** Always exclude soft-deleted rows. */
export const live = { deletedAt: null } as const;

export const byRegion = (scope?: LoadScope): Record<string, unknown> =>
  scope?.regionIds ? { regionId: { in: scope.regionIds } } : {};
export const byProject = (scope?: LoadScope): Record<string, unknown> =>
  scope?.projectIds ? { projectId: { in: scope.projectIds } } : {};
