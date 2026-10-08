import "server-only";
import { notFound } from "next/navigation";
import { can } from "@/lib/server/permissions";
import { requireUser } from "@/lib/auth/session";
import { isFeatureEnabled } from "@/modules/settings/queries";
import type { FeatureModule } from "@/modules/settings/keys";

/**
 * Page gate for the enhancement modules: the module must be switched on (Settings feature toggle via isFeatureEnabled;
 * a false value 404s the route) and the user needs VIEW. CREATE / UPDATE flags drive which buttons render.
 */
export async function moduleAccess(moduleKey: FeatureModule) {
  const user = await requireUser();
  const [enabled, canView, canCreate, canUpdate] = await Promise.all([
    isFeatureEnabled(moduleKey),
    can(user, moduleKey, "VIEW"),
    can(user, moduleKey, "CREATE"),
    can(user, moduleKey, "EDIT"),
  ]);
  if (!enabled) notFound();
  return { canView, canCreate, canUpdate };
}
