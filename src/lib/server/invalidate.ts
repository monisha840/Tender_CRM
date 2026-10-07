// Not "server-only" on purpose: unit tests import runAction. Safe no-op outside a Next request.
import { revalidateTag, updateTag } from "next/cache";

/** Cache tag of the shared server snapshot (see src/lib/data/server/server-db.ts). */
export const SERVER_DB_TAG = "server-db";

/**
 * Called by runAction after every committed write. Inside a server action `updateTag` expires the snapshot so the
 * caller reads its own write on the next render; elsewhere (route handlers, jobs) it falls back to `revalidateTag`.
 */
export function invalidateServerDb(): void {
  try {
    updateTag(SERVER_DB_TAG);
  } catch {
    try {
      revalidateTag(SERVER_DB_TAG, "max");
    } catch {
      /* not inside a Next request (unit tests, scripts): nothing cached to invalidate */
    }
  }
}
