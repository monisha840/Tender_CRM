import "server-only";
import { cache } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { PHASE67_ENABLED } from "@/lib/features";
import { prisma } from "@/lib/server/prisma";
import { SERVER_DB_TAG } from "@/lib/server/invalidate";
import type { Database, Id } from "@/types";
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
  const { db } = await loadDatabaseLean(prisma, userId, { phase67: PHASE67_ENABLED }, await cachedSnapshot(PHASE67_ENABLED));
  return db;
});
