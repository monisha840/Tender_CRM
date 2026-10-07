// Server-only: Prisma loaders for users, roles, permissions, scopes, employees and thresholds.
//
// Scope and action enums map losslessly (UI types now include OWN_RECORDS, DELETE and REVIEW).
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
  ApprovalThreshold,
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
import { base, isoDate, isoDateOrNull, LIVE, money, STABLE_ORDER } from "./convert";

const SCOPE_MAP: Record<PScope, PermissionScope> = {
  ALL: "ALL",
  OWN_REGION: "OWN_REGION",
  OWN_PROJECTS: "OWN_PROJECTS",
  OWN_SITES: "OWN_SITES",
  OWN_RECORDS: "OWN_RECORDS",
};
export const mapScope = (s: PScope): PermissionScope => SCOPE_MAP[s];

/** Lossless: the UI PermissionAction now carries every Prisma action (incl. DELETE, REVIEW). */
export const mapAction = (a: PAction): PermissionAction => a;

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

export const mapPermission = (r: PPermission): Permission => ({ ...base(r), module: r.module, action: mapAction(r.action) });

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

export type ApprovalThresholdRow = ApprovalThreshold;
export const mapApprovalThreshold = (r: PThreshold): ApprovalThreshold => ({
  ...base(r),
  flowId: r.flowId,
  roleId: r.roleId,
  maxAmount: money(r.maxAmount),
});

export type AccessSlice = Pick<
  Database,
  "users" | "roles" | "permissions" | "rolePermissions" | "userRoles" | "userRegions" | "employees" | "projectMembers" | "approvalThresholds"
>;

/**
 * Everything getPersona / getScope / can / getAllowedRegionIds read, plus employees and project members
 * (the OWN_PROJECTS linkage: user -> employee -> project member).
 */
export async function loadAccess(prisma: PrismaClient): Promise<AccessSlice> {
  const args = { where: LIVE, orderBy: STABLE_ORDER };
  const [users, roles, permissions, rolePermissions, userRoles, userRegions, employees, members, thresholds] = await Promise.all([
    prisma.user.findMany(args),
    prisma.role.findMany(args),
    prisma.permission.findMany(args),
    prisma.rolePermission.findMany(args),
    prisma.userRole.findMany(args),
    prisma.userRegion.findMany(args),
    prisma.employee.findMany(args),
    prisma.projectMember.findMany(args),
    prisma.approvalThreshold.findMany(args),
  ]);
  return {
    users: users.map(mapUser),
    roles: roles.map(mapRole),
    permissions: permissions.map(mapPermission),
    rolePermissions: rolePermissions.map(mapRolePermission),
    userRoles: userRoles.map(mapUserRole),
    userRegions: userRegions.map(mapUserRegion),
    employees: employees.map(mapEmployee),
    projectMembers: members.map(mapProjectMember),
    approvalThresholds: thresholds.map(mapApprovalThreshold),
  };
}

export async function loadApprovalThresholds(prisma: PrismaClient): Promise<ApprovalThresholdRow[]> {
  const rows = await prisma.approvalThreshold.findMany({ where: LIVE, orderBy: STABLE_ORDER });
  return rows.map(mapApprovalThreshold);
}
