import type { Database, Id, PermissionAction, PermissionScope, Role, User } from "@/types";
import { ALL_REGIONS, byId, type RegionFilter } from "./shared";

/**
 * UI-only access helpers for the MVP. There is no backend, so this controls what the demo shows
 * for the selected persona and is NOT security. The real server-side `can()` replaces it later.
 */

export interface Persona {
  user: User;
  role: Role;
  regionIds: Id[];
}

export function getPersona(db: Database, userId: Id): Persona | null {
  const user = byId(db.users, userId);
  if (!user) return null;
  const roleLink = db.userRoles.find((r) => r.userId === userId);
  const role = byId(db.roles, roleLink?.roleId);
  if (!role) return null;
  return { user, role, regionIds: db.userRegions.filter((r) => r.userId === userId).map((r) => r.regionId) };
}

/** All demo personas, ordered by role then name, for the role switcher. */
export function listPersonas(db: Database): Persona[] {
  const order = new Map(db.roles.map((r, i) => [r.id, i]));
  return db.users
    .map((u) => getPersona(db, u.id))
    .filter((p): p is Persona => p !== null)
    .sort((a, b) => (order.get(a.role.id)! - order.get(b.role.id)!) || a.user.name.localeCompare(b.user.name));
}

const SCOPE_RANK: Record<PermissionScope, number> = { OWN_SITES: 0, OWN_PROJECTS: 1, OWN_REGION: 2, ALL: 3 };

/** Widest scope granted for an action on a module, or null when not granted at all. */
export function getScope(db: Database, userId: Id, module: string, action: PermissionAction = "VIEW"): PermissionScope | null {
  const roleIds = db.userRoles.filter((r) => r.userId === userId).map((r) => r.roleId);
  const permission = db.permissions.find((p) => p.module === module && p.action === action);
  if (!permission) return null;
  const grants = db.rolePermissions.filter((g) => g.permissionId === permission.id && roleIds.includes(g.roleId));
  if (!grants.length) return null;
  return grants.map((g) => g.scope).sort((a, b) => SCOPE_RANK[b] - SCOPE_RANK[a])[0];
}

export const canView = (db: Database, userId: Id, module: string): boolean => getScope(db, userId, module, "VIEW") !== null;
export const can = (db: Database, userId: Id, module: string, action: PermissionAction): boolean =>
  getScope(db, userId, module, action) !== null;

/** Regions this user may see: every region for ALL-scope roles, otherwise their assigned regions. */
export function getAllowedRegionIds(db: Database, userId: Id): Id[] {
  const persona = getPersona(db, userId);
  if (!persona) return [];
  const allRegions = db.regions.filter((r) => r.isActive).map((r) => r.id);
  const hasAll = db.rolePermissions.some(
    (g) => g.roleId === persona.role.id && g.scope === "ALL",
  );
  return hasAll ? allRegions : persona.regionIds;
}

/** Clamp the chosen region filter to what the user may see. */
export function effectiveRegionFilter(db: Database, userId: Id, chosen: RegionFilter): RegionFilter {
  const allowed = getAllowedRegionIds(db, userId);
  if (allowed.length === 1) return allowed[0];
  if (chosen !== ALL_REGIONS && !allowed.includes(chosen)) return ALL_REGIONS;
  return chosen;
}
