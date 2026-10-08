import "server-only";
import { notFound } from "next/navigation";
import { can } from "@/lib/server/permissions";
import { requireUser } from "@/lib/auth/session";
import { getSettingValue } from "@/lib/server/settings-read";

/**
 * Page gate for the enhancement modules: the module must be switched on (Setting `features.<moduleKey>`, default on;
 * a false value 404s the route) and the user needs VIEW. CREATE / UPDATE flags drive which buttons render.
 */
export async function moduleAccess(moduleKey: string) {
  const user = await requireUser();
  const [enabled, canView, canCreate, canUpdate] = await Promise.all([
    getSettingValue<boolean>(`features.${moduleKey}`, true),
    can(user, moduleKey, "VIEW"),
    can(user, moduleKey, "CREATE"),
    can(user, moduleKey, "EDIT"),
  ]);
  if (enabled === false) notFound();
  return { canView, canCreate, canUpdate };
}
