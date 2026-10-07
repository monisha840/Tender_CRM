/**
 * Ensures the two E2E test users exist (idempotent): Supabase Auth user (service role, email confirmed,
 * no invite email) + matching Prisma User + UserRole. Server-side only. Guarded like db-reset.
 *   npm run e2e:users
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { assertSafeToReset } from "./db-reset";

export const E2E_USERS = [
  { email: "admin@sprince.example", name: "System Administrator", roleKey: "system_admin" },
  { email: "a.joseph.stalin@sprince.example", name: "Dr. A. Joseph Stalin", roleKey: "director" },
] as const;

export async function ensureE2eUsers(): Promise<void> {
  assertSafeToReset();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!url || !key) throw new Error("e2e-users: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.");
  if (!password) throw new Error("e2e-users: E2E_TEST_PASSWORD not set.");

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const prisma = new PrismaClient();
  try {
    const existing = new Map<string, string>();
    for (let page = 1; page < 50; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(`e2e-users: listUsers failed: ${error.message}`);
      for (const u of data.users) if (u.email) existing.set(u.email.toLowerCase(), u.id);
      if (data.users.length < 200) break;
    }

    for (const u of E2E_USERS) {
      let authId = existing.get(u.email);
      if (authId) {
        // Only touch the password when it does not already work: updating it revokes every live session, which
        // broke concurrent/sequential Playwright runs sharing these two users.
        const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        let passwordWorks = false;
        if (anon) {
          const probe = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
          const { error: signInError } = await probe.auth.signInWithPassword({ email: u.email, password });
          passwordWorks = !signInError;
        }
        if (!passwordWorks) {
          const { error } = await supabase.auth.admin.updateUserById(authId, { password, email_confirm: true });
          if (error) throw new Error(`e2e-users: update ${u.email} failed: ${error.message}`);
        }
      } else {
        const { data, error } = await supabase.auth.admin.createUser({ email: u.email, password, email_confirm: true });
        if (error || !data.user) throw new Error(`e2e-users: create ${u.email} failed: ${error?.message}`);
        authId = data.user.id;
      }

      const role = await prisma.role.findUnique({ where: { key: u.roleKey } });
      if (!role) throw new Error(`e2e-users: role '${u.roleKey}' missing; run the base seed first.`);

      const existingUser =
        (await prisma.user.findUnique({ where: { authUserId: authId } })) ??
        (await prisma.user.findFirst({ where: { email: u.email } }));
      // Seeded demo users keep their seeded name; only brand-new rows get one.
      const data = { email: u.email, authUserId: authId, isActive: true, mustChangePassword: false, deletedAt: null };
      const saved = existingUser
        ? await prisma.user.update({ where: { id: existingUser.id }, data })
        : await prisma.user.create({ data: { ...data, name: u.name } });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: saved.id, roleId: role.id } },
        update: { deletedAt: null },
        create: { userId: saved.id, roleId: role.id },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
if (/\/e2e-users\.(ts|js)$/.test(entry)) {
  ensureE2eUsers()
    .then(() => console.log("E2E users ready."))
    .catch((e) => {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
