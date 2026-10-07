// Server-only: Prisma loaders for users, roles, permissions, scopes, employees and thresholds.
//
// Scope mapping (Prisma PermissionScope -> UI PermissionScope)
//  ALL -> ALL, OWN_REGION -> OWN_REGION, OWN_PROJECTS -> OWN_PROJECTS, OWN_SITES -> OWN_SITES,
//  OWN_RECORDS -> OWN_SITES  (the UI type has no "own records" level; OWN_SITES is the narrowest, so the UI
//  never shows MORE than the server would allow. The server-side can() keeps the real OWN_RECORDS.)
// Action mapping: the UI PermissionAction has no DELETE/REVIEW. Those permissions (and their grants) are
//  omitted from the snapshot; nothing in src/lib/data asks for them. See docs/shared-changes.md.
import type {
  ApprovalThreshold as PThreshold,
  Employee as PEmployee,
  Permission as PPermission,
  PermissionAction as PAction,
  PermissionScope as PScope,
  PrismaClient,
  ProjectMember as PProjectMember,
  Role as PRole,
  RolePermission as PRolePermission,
  User as PUser,
  UserRegion as PUserRegion,
  UserRole as PUserRole,
} from "@prisma/client";
import type {
  Database,
  Employee,
  Money,
  Permission,
  PermissionAction,
  PermissionScope,
  ProjectMember,
  Role,
  RolePermission,
  User,
  UserRegion,
  UserRole,
} from "@/types";
import { base, isoDate, isoDateOrNull, LIVE, money, STABLE_ORDER } from "./map-common";

const SCOPE_MAP: Record<PScope, PermissionScope> = {
  ALL: "ALL",
  OWN_REGION: "OWN_REGION",
  OWN_PROJECTS: "OWN_PROJECTS",
  OWN_SITES: "OWN_SITES",
  OWN_RECORDS: "OWN_SITES",
};
export const mapScope = (s: PScope): PermissionScope => SCOPE_MAP[s];

const UI_ACTIONS: ReadonlySet<string> = new Set<PermissionAction>([
  "VIEW", "CREATE", "EDIT", "APPROVE", "ASSIGN_WORK", "SUBMIT", "REJECT", "MANAGE_FINANCE",
]);
/** Returns the UI action, or null for server-only actions (DELETE, REVIEW). */
export const mapAction = (a: PAction): PermissionAction | null => (UI_ACTIONS.has(a) ? (a as PermissionAction) : null);

export const mapUser = (r: PUser): User => ({ ...base(r), name: r.name, email: r.email, isActive: r.isActive });

export const mapRole = (r: PRole): Role => ({
  ...base(r),
  key: r.key,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  isActive: r.isActive,
  layout: r.layout,
  homePath: r.homePath,
});

/** null when the action is server-only. */
export function mapPermission(r: PPermission): Permission | null {
  const action = mapAction(r.action);
  return action ? { ...base(r), module: r.module, action } : null;
}

export const mapRolePermission = (r: PRolePermission): RolePermission => ({
  ...base(r),
  roleId: r.roleId,
  permissionId: r.permissionId,
  scope: mapScope(r.scope),
});

export const mapUserRole = (r: PUserRole): UserRole => ({ ...base(r), userId: r.userId, roleId: r.roleId });
export const mapUserRegion = (r: PUserRegion): UserRegion => ({ ...base(r), userId: r.userId, regionId: r.regionId });

export const mapEmployee = (r: PEmployee): Employee => ({
  ...base(r),
  code: r.code,
  name: r.name,
  phone: r.phone,
  homeRegionId: r.homeRegionId,
  userId: r.userId,
});

export const mapProjectMember = (r: PProjectMember): ProjectMember => ({
  ...base(r),
  projectId: r.projectId,
  employeeId: r.employeeId,
  roleLabel: r.roleLabel,
  fromDate: isoDate(r.fromDate),
  toDate: isoDateOrNull(r.toDate),
});

/** Not part of `Database` (no UI table); consumed by server-side approval routing. */
export interface ApprovalThresholdRow {
  id: string;
  flowId: string;
  roleId: string;
  /** Decimal string. */
  maxAmount: Money;
}
export const mapApprovalThreshold = (r: PThreshold): ApprovalThresholdRow => ({
  id: r.id,
  flowId: r.flowId,
  roleId: r.roleId,
  maxAmount: money(r.maxAmount),
});

export type AccessSlice = Pick<
  Database,
  "users" | "roles" | "permissions" | "rolePermissions" | "userRoles" | "userRegions" | "employees" | "projectMembers"
>;

/**
 * Everything getPersona / getScope / can / getAllowedRegionIds read, plus employees and project members
 * (the OWN_PROJECTS linkage: user -> employee -> project member). Grants pointing at an omitted permission are dropped.
 */
export async function loadAccess(prisma: PrismaClient): Promise<AccessSlice> {
  const args = { where: LIVE, orderBy: STABLE_ORDER };
  const [users, roles, permissions, rolePermissions, userRoles, userRegions, employees, members] = await Promise.all([
    prisma.user.findMany(args),
    prisma.role.findMany(args),
    prisma.permission.findMany(args),
    prisma.rolePermission.findMany(args),
    prisma.userRole.findMany(args),
    prisma.userRegion.findMany(args),
    prisma.employee.findMany(args),
    prisma.projectMember.findMany(args),
  ]);
  const mappedPermissions = permissions.map(mapPermission).filter((p): p is Permission => p !== null);
  const kept = new Set(mappedPermissions.map((p) => p.id));
  return {
    users: users.map(mapUser),
    roles: roles.map(mapRole),
    permissions: mappedPermissions,
    rolePermissions: rolePermissions.filter((g) => kept.has(g.permissionId)).map(mapRolePermission),
    userRoles: userRoles.map(mapUserRole),
    userRegions: userRegions.map(mapUserRegion),
    employees: employees.map(mapEmployee),
    projectMembers: members.map(mapProjectMember),
  };
}

export async function loadApprovalThresholds(prisma: PrismaClient): Promise<ApprovalThresholdRow[]> {
  const rows = await prisma.approvalThreshold.findMany({ where: LIVE, orderBy: STABLE_ORDER });
  return rows.map(mapApprovalThreshold);
}
