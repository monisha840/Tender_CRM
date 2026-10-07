import type { BaseEntity, Id } from "./common";

/** Fixed technical set (docs/system-flow.md §2.4). */
export type PermissionAction =
  | "VIEW"
  | "CREATE"
  | "EDIT"
  | "APPROVE"
  | "ASSIGN_WORK"
  | "SUBMIT"
  | "REJECT"
  | "MANAGE_FINANCE";

export type PermissionScope = "ALL" | "OWN_REGION" | "OWN_PROJECTS" | "OWN_SITES";

/**
 * Roles are data, not code. `layout` decides which app shell a role gets
 * (office sidebar vs mobile-first site shell with bottom nav) and `homePath` where it lands.
 */
export interface Role extends BaseEntity {
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  isActive: boolean;
  layout: "OFFICE" | "SITE";
  homePath: string;
}

/** The catalogue of grantable permissions. `module` matches a key in lib/nav.ts. */
export interface Permission extends BaseEntity {
  module: string;
  action: PermissionAction;
}

export interface RolePermission extends BaseEntity {
  roleId: Id;
  permissionId: Id;
  scope: PermissionScope;
}

export interface UserRole extends BaseEntity {
  userId: Id;
  roleId: Id;
}

/** Defines what "own region" means for a user. */
export interface UserRegion extends BaseEntity {
  userId: Id;
  regionId: Id;
}
