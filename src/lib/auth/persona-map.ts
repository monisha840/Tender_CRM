import type { Database, Id } from "@/types";

/**
 * Finds the `db.users` row for the signed-in user. The session user id IS the CRM `User.id`, so the id wins; e-mail
 * (case-insensitive) is only a safety net. Returns null when the user is not in the snapshot (no guessing, no
 * stand-in persona: the caller shows an access-denied state instead).
 */
export function matchDbUserId(db: Pick<Database, "users">, user: { id?: string; email: string }): Id | null {
  if (user.id) {
    const byId = db.users.find((u) => u.id === user.id);
    if (byId) return byId.id;
  }
  const email = user.email.trim().toLowerCase();
  return db.users.find((u) => u.email.toLowerCase() === email)?.id ?? null;
}
