import "server-only";
import { isFeatureEnabled } from "@/modules/settings/queries";
import type { FeatureModule } from "@/modules/settings/keys";

export interface ModuleAccess {
  enabled: boolean;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
}

/** Everything a server page needs to decide what to render for the signed-in user (UI hiding only; actions re-check). */
export async function moduleAccess(moduleKey: FeatureModule): Promise<ModuleAccess> {
  const [{ requireUser }, { can }] = await Promise.all([import("@/lib/auth/session"), import("@/lib/server/permissions")]);
  const user = await requireUser();
  const [enabled, canView, canCreate, canUpdate] = await Promise.all([
    isFeatureEnabled(moduleKey),
    can(user, moduleKey, "VIEW"),
    can(user, moduleKey, "CREATE"),
    can(user, moduleKey, "EDIT"),
  ]);
  return { enabled, canView, canCreate, canUpdate };
}
