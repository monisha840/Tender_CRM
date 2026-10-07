/** Seeded demo users used by the smoke suite (see docs/progress.md D9). Password comes from E2E_TEST_PASSWORD, never printed. */
export const USERS = {
  admin: { email: "admin@sprince.example", name: "System Administrator", roleLabel: /system admin/i },
  director: { email: "a.joseph.stalin@sprince.example", name: "Stalin", roleLabel: /director/i },
} as const;
export type RoleKey = keyof typeof USERS;

export const password = (): string => {
  const p = process.env.E2E_TEST_PASSWORD;
  if (!p) throw new Error("E2E_TEST_PASSWORD is not set (.env.local)");
  return p;
};
