import type { Database, Id } from "@/types";

/** A region id, or "ALL" for every region the user may see. */
export type RegionFilter = Id | "ALL";
export const ALL_REGIONS = "ALL" as const;

export const inRegion = (filter: RegionFilter, regionId: Id | null | undefined): boolean =>
  filter === ALL_REGIONS || regionId === filter;

export function byId<T extends { id: Id }>(rows: readonly T[], id: Id | null | undefined): T | undefined {
  return id ? rows.find((r) => r.id === id) : undefined;
}

/** Like byId, but a missing reference is a data bug, so fail loudly. */
export function mustFind<T extends { id: Id }>(rows: readonly T[], id: Id, what: string): T {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`${what} not found: ${id}`);
  return row;
}

export const live = <T extends { deletedAt?: string | null }>(rows: readonly T[]): T[] => rows.filter((r) => !r.deletedAt);

export const regionName = (db: Database, id: Id | null | undefined): string => byId(db.regions, id)?.name ?? "—";
export const organisationName = (db: Database, id: Id | null | undefined): string => byId(db.organisations, id)?.name ?? "—";
export const userName = (db: Database, id: Id | null | undefined): string => byId(db.users, id)?.name ?? "—";
export const employeeName = (db: Database, id: Id | null | undefined): string => byId(db.employees, id)?.name ?? "—";

export const sum = (values: Iterable<number>): number => {
  let t = 0;
  for (const v of values) t += v;
  return t;
};
