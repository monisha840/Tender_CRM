import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { User as AuthUser } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/server/prisma";
import { AuthError, type SessionUser } from "@/lib/server/auth-types";

/** Session user plus display/flow data the shell needs (the shared SessionUser contract stays unchanged). */
export interface SessionContext {
  user: SessionUser;
  roleNames: string[];
  homePath: string;
  mustChangePassword: boolean;
}

export type SessionUserRow = {
  id: string;
  authUserId: string | null;
  email: string;
  name: string;
  isActive: boolean;
  deletedAt: Date | null;
  mustChangePassword: boolean;
  roles: { role: { key: string; name: string; homePath: string; isActive: boolean; deletedAt: Date | null } }[];
};

/** Pure mapping, exported for tests. Null when the profile is missing, or the user is inactive/deleted/without a role. */
export function mapSessionContext(authUser: Pick<AuthUser, "id">, row: SessionUserRow | null): SessionContext | null {
  if (!row || !row.isActive || row.deletedAt || row.authUserId !== authUser.id) return null;
  const roles = row.roles.map((r) => r.role).filter((r) => r.isActive && !r.deletedAt);
  if (roles.length === 0) return null;
  return {
    user: { id: row.id, authUserId: authUser.id, email: row.email, name: row.name, roleKeys: roles.map((r) => r.key) },
    roleNames: roles.map((r) => r.name),
    homePath: roles[0].homePath || "/dashboard",
    mustChangePassword: row.mustChangePassword,
  };
}

export async function loadSessionContext(authUser: Pick<AuthUser, "id">): Promise<SessionContext | null> {
  const row = await prisma.user.findUnique({
    where: { authUserId: authUser.id },
    select: {
      id: true,
      authUserId: true,
      email: true,
      name: true,
      isActive: true,
      deletedAt: true,
      mustChangePassword: true,
      roles: {
        where: { deletedAt: null },
        select: { role: { select: { key: true, name: true, homePath: true, isActive: true, deletedAt: true } } },
      },
    },
  });
  return mapSessionContext(authUser, row);
}

/** Verified session (auth.getUser() hits Supabase; the cookie alone is never trusted), cached per request. */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  // Supabase reads Date.now() while loading the session; make the render dynamic first so it is not "prerendered".
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return loadSessionContext(data.user);
});

export async function getSessionUser(): Promise<SessionUser | null> {
  return (await getSessionContext())?.user ?? null;
}

/** For pages and layouts: redirects to /login when there is no valid user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** For server actions and route handlers: throws AuthError('UNAUTHENTICATED'). */
export async function requireUserForAction(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  return user;
}
