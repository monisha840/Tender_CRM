import "server-only";
// Shared read helpers for Settings-driven behaviour. Used by every package; owned by the orchestrator.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";

type Db = Pick<typeof prisma, "setting" | "statutoryRate">;

/** Value of a Setting key (global row, regionId null), or `fallback` when unset. */
export async function getSettingValue<T>(key: string, fallback: T, db: Db = prisma): Promise<T> {
  const row = await db.setting.findFirst({ where: { key, regionId: null, deletedAt: null }, select: { value: true } });
  return row ? (row.value as T) : fallback;
}

export interface RateOn {
  code: string;
  value: Prisma.Decimal;
  unit: string;
  effectiveFrom: Date;
  sourceNote: string | null;
}

/**
 * Statutory rate valid on `date`: the active row of `code` with the latest effectiveFrom <= date.
 * `category`/`regionId` narrow the lookup; a narrower row wins over a generic one.
 */
export async function rateOn(
  code: string,
  date: Date,
  opts: { category?: string | null; regionId?: string | null } = {},
  db: Db = prisma,
): Promise<RateOn | null> {
  const rows = await db.statutoryRate.findMany({
    where: { code, isActive: true, deletedAt: null, effectiveFrom: { lte: date } },
    orderBy: { effectiveFrom: "desc" },
  });
  const fits = (r: (typeof rows)[number]) =>
    (r.category == null || r.category === opts.category) && (r.regionId == null || r.regionId === opts.regionId);
  const specificity = (r: (typeof rows)[number]) => (r.category ? 1 : 0) + (r.regionId ? 1 : 0);
  const best = rows.filter(fits).sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime() || specificity(b) - specificity(a))[0];
  return best ? { code: best.code, value: best.value, unit: best.unit, effectiveFrom: best.effectiveFrom, sourceNote: best.sourceNote } : null;
}
