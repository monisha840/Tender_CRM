import "server-only";
import { prisma } from "@/lib/server/prisma";
import { getSettingValue } from "@/lib/server/settings-read";

/** Reads a stored toggle value: `true`/`false`, `{ enabled: boolean }`, or the strings "true"/"false". */
export function readToggle(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" ? true : v === "false" ? false : null;
  if (v && typeof v === "object" && "enabled" in v) return readToggle((v as { enabled: unknown }).enabled);
  return null;
}

/**
 * Module on/off switch from Settings. Looks at Setting `feature.<moduleKey>` first, then at a `features` map
 * ({ "<moduleKey>": boolean }). Unset means ON (the nav item and permissions already gate the module).
 * ASSUMED key shape: the Settings agent owns the toggle UI; adjust here if it stores them differently.
 */
export async function isModuleEnabled(moduleKey: string, db: Pick<typeof prisma, "setting" | "statutoryRate"> = prisma): Promise<boolean> {
  const direct = readToggle(await getSettingValue<unknown>(`feature.${moduleKey}`, null, db));
  if (direct !== null) return direct;
  const map = await getSettingValue<unknown>("features", null, db);
  if (map && typeof map === "object") {
    const fromMap = readToggle((map as Record<string, unknown>)[moduleKey]);
    if (fromMap !== null) return fromMap;
  }
  return true;
}

export interface ModuleAccess {
  enabled: boolean;
  canView: boolean;
  canCreate: boolean;
  canUpdate: boolean;
}

/** Everything a server page needs to decide what to render for the signed-in user (UI hiding only; actions re-check). */
export async function moduleAccess(moduleKey: string): Promise<ModuleAccess> {
  const [{ requireUser }, { can }] = await Promise.all([import("@/lib/auth/session"), import("@/lib/server/permissions")]);
  const user = await requireUser();
  const [enabled, canView, canCreate, canUpdate] = await Promise.all([
    isModuleEnabled(moduleKey),
    can(user, moduleKey, "VIEW"),
    can(user, moduleKey, "CREATE"),
    can(user, moduleKey, "EDIT"),
  ]);
  return { enabled, canView, canCreate, canUpdate };
}
