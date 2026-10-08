import "server-only";
import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/lib/server/prisma";
import { SERVER_DB_TAG } from "@/lib/server/invalidate";
import type { Database, Id } from "@/types";
import { effectivePhase67, loadAppSettings } from "@/modules/settings/queries";
import { loadDatabaseLean, loadSharedSnapshot } from "./snapshot";

/**
 * The unscoped snapshot, shared by every unrestricted user and cached by Next ("use cache").
 * Short life as a safety net (writes made outside runAction, other instances); runAction expires it immediately
 * through the `server-db` tag, so a user always reads their own write.
 */
async function cachedSnapshot(phase67: boolean): Promise<Database> {
  "use cache";
  cacheLife({ stale: 30, revalidate: 30, expire: 600 });
  cacheTag(SERVER_DB_TAG);
  return loadSharedSnapshot(prisma, { phase67 });
}

/** The Database for the signed-in user (React-cached per request). */
export const getServerDb = cache(async (userId: Id): Promise<Database> => {
  // Settings > Feature toggles (the env flag still overrides): decides whether finance/payroll/daily-work rows are loaded.
  const phase67 = effectivePhase67(await loadAppSettings(), process.env.NEXT_PUBLIC_FEATURE_FINANCE_PAYROLL);
  const { db } = await loadDatabaseLean(prisma, userId, { phase67 }, await cachedSnapshot(phase67));
  return db;
});
