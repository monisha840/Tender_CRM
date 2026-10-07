// Server-only helpers shared by the Prisma loaders in this folder. Pure, DB-free.
import type { BaseEntity, IsoDate, IsoDateTime, Money } from "@/types";

/** Audit/soft-delete columns every business row carries (version/createdById/updatedById are dropped: not in the UI types). */
export interface RowBase {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** Timestamp -> ISO 8601 UTC string. */
export const isoDateTime = (d: Date): IsoDateTime => d.toISOString();

/** `@db.Date` column -> "YYYY-MM-DD". Prisma returns UTC midnight, so the UTC slice is the stored day. */
export const isoDate = (d: Date): IsoDate => d.toISOString().slice(0, 10);

export const isoDateOrNull = (d: Date | null | undefined): IsoDate | null => (d ? isoDate(d) : null);

/** Decimal -> plain string with no float round trip ("23100000.00"). */
export const money = (d: { toString(): string }): Money => d.toString();

/** BaseEntity columns. */
export function base(r: RowBase): BaseEntity {
  return {
    id: r.id,
    createdAt: isoDateTime(r.createdAt),
    updatedAt: isoDateTime(r.updatedAt),
    deletedAt: r.deletedAt ? isoDateTime(r.deletedAt) : null,
  };
}

/** Standard filter: hide soft-deleted rows. */
export const LIVE = { deletedAt: null } as const;

/** Stable ordering so snapshots and tests are deterministic. */
export const STABLE_ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }];
