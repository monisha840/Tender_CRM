/**
 * Shared primitives for the front-end MVP (mock data, no backend).
 * Names follow docs/data-model-full.md so these types can be promoted to Prisma later.
 */

export type Id = string;

/** Decimal as a string, e.g. "23100000.00". Never a JS float (matches Prisma Decimal serialisation). */
export type Money = string;

/** Decimal(7,4) as a string, e.g. "-3.7500". */
export type Percent = string;

/** Date-only, "YYYY-MM-DD". */
export type IsoDate = string;

/** UTC timestamp, ISO 8601. Display in Asia/Kolkata. */
export type IsoDateTime = string;

export interface BaseEntity {
  id: Id;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  /** Soft delete. */
  deletedAt?: IsoDateTime | null;
}
