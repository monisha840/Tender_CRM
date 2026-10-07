// Server-only: never import from client components.
import * as React from "react";
import type { PermissionAction } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import { AuthError, type SessionUser } from "@/lib/server/auth-types";

/**
 * Permission check against the Role / Permission / RolePermission tables (roles are data, never hard-coded).
 * Minimal scope: no region/project scoping, so a grant is simply (module, action). `scopeFilter` is kept so
 * scope can be added later without touching call sites.
 */

type Memo = <A extends unknown[], R>(fn: (...a: A) => R) => (...a: A) => R;
// React's request-scoped `cache` memoises per server request; outside a request (tests, scripts) it is a pass-through.
const memo: Memo = (React as unknown as { cache?: Memo }).cache ?? ((fn) => fn);

/** "module:action" grants held by the union of the given roles. Memoised per request by role-key list. */
const grantsFor = memo(async (roleKeysCsv: string): Promise<Set<string>> => {
  const roleKeys = roleKeysCsv ? roleKeysCsv.split(",") : [];
  if (roleKeys.length === 0) return new Set();
  const rows = await prisma.rolePermission.findMany({
    where: {
      deletedAt: null,
      role: { key: { in: roleKeys }, isActive: true, deletedAt: null },
      permission: { deletedAt: null },
    },
    select: { permission: { select: { module: true, action: true } } },
  });
  return new Set(rows.map((r) => `${r.permission.module}:${r.permission.action}`));
});

const grantsOf = (user: SessionUser) => grantsFor([...user.roleKeys].sort().join(","));

/** True when any of the user's roles grants (module, action). */
export async function can(user: SessionUser, module: string, action: PermissionAction): Promise<boolean> {
  return (await grantsOf(user)).has(`${module}:${action}`);
}

/** Throws AuthError("FORBIDDEN") unless the user may perform (module, action). Call this on the server for every action. */
export async function assertCan(user: SessionUser, module: string, action: PermissionAction): Promise<void> {
  if (!(await can(user, module, action))) {
    throw new AuthError("FORBIDDEN", `Not allowed: ${module}:${action}`);
  }
}

/**
 * Row filter to merge into Prisma `where` clauses for list/read queries. Minimal scope: everyone who passes `can`
 * sees everything, so this is `{}`. Future scope (own region / project / site) is added here, once, for every caller.
 */
export function scopeFilter(user: SessionUser, module: string): Record<string, never> {
  void user;
  void module;
  return {};
}
