import type { Database, Id } from "@/types";

/** Seed persona that stands in for each real role while screens still run on the Zustand mock data (until S3). */
export const ROLE_PERSONA_FALLBACK: Record<string, Id> = {
  director: "usr_stalin",
  system_admin: "usr_tender1",
};

/**
 * Maps the logged-in user to a mock seed persona: same email first, else by role key, else the first seed user.
 * Temporary bridge: the real user, not this persona, is authoritative on the server.
 */
export function resolvePersonaUserId(
  db: Pick<Database, "users">,
  user: { email: string; roleKeys: string[] },
): Id {
  const email = user.email.trim().toLowerCase();
  const byEmail = db.users.find((u) => u.email.toLowerCase() === email);
  if (byEmail) return byEmail.id;
  for (const key of user.roleKeys) {
    const id = ROLE_PERSONA_FALLBACK[key];
    if (id && db.users.some((u) => u.id === id)) return id;
  }
  return db.users[0].id;
}
