/** Contract shared by the auth (session) and permission/service layers. */
export type SessionUser = {
  /** Prisma User.id */
  id: string;
  /** Supabase Auth user id */
  authUserId: string;
  email: string;
  name: string;
  /** Role keys from the Role table (minimal scope: "system_admin" | "director"). */
  roleKeys: string[];
};

/** Throws/redirects are the implementation's job; callers get a user or an error. */
export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN" | "SELF_APPROVAL" | "REASON_REQUIRED", message?: string) {
    super(message ?? code);
  }
}
