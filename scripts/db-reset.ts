/**
 * Guarded dev/test database reset: truncates every data table, then seeds base masters
 * (and the demo dataset when SEED_DEMO=true).
 *
 *   npm run db:reset                    -> truncate + base masters
 *   SEED_DEMO=true npm run db:reset     -> truncate + base masters + demo data
 *
 * Refuses unless APP_ENV is 'development' or 'test', and refuses when DATABASE_URL points at a
 * production-flagged host/project (any URL containing "prod", plus PRODUCTION_DB_MARKERS = comma-separated substrings,
 * e.g. the production Supabase project ref).
 * Clears the append-only audit tables through the transaction-local setting app.allow_audit_reset = 'on'
 * (see the hardening migration); normal application code never sets it.
 *
 * Reusable: `import { resetDatabase } from "../scripts/db-reset"` (e.g. Playwright global setup).
 */
import { PrismaClient } from "@prisma/client";
import { seedAll } from "../prisma/seed";
import { assertNotProductionDb } from "./prod-guard";

export function assertSafeToReset(env: NodeJS.ProcessEnv = process.env): void {
  assertNotProductionDb("db-reset/e2e", env);
  const appEnv = env.APP_ENV;
  if (appEnv === "production") throw new Error("db-reset refused: APP_ENV=production.");
  if (appEnv !== "development" && appEnv !== "test") {
    throw new Error(`db-reset refused: APP_ENV must be 'development' or 'test' (got '${appEnv ?? "unset"}').`);
  }
  const url = env.DATABASE_URL;
  if (!url) throw new Error("db-reset refused: DATABASE_URL is not set.");
  const lowered = url.toLowerCase();
  const markers = ["prod", ...(env.PRODUCTION_DB_MARKERS ?? "").split(",").map((m) => m.trim().toLowerCase()).filter(Boolean)];
  if (markers.some((m) => lowered.includes(m))) {
    throw new Error("db-reset refused: DATABASE_URL matches a production marker.");
  }
}

/** Truncate all data tables (not _prisma_migrations), including the append-only audit tables. */
export async function truncateAll(prisma: PrismaClient): Promise<number> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return 0;
  const list = rows.map((r) => `"public"."${r.tablename.replace(/"/g, '""')}"`).join(", ");
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.allow_audit_reset', 'on', true)`;
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  });
  return rows.length;
}

export async function resetDatabase(opts: { demo?: boolean } = {}): Promise<void> {
  assertSafeToReset();
  const prisma = new PrismaClient();
  try {
    const n = await truncateAll(prisma);
    console.log(`Truncated ${n} tables.`);
    await seedAll(prisma, { demo: opts.demo ?? process.env.SEED_DEMO === "true" });
  } finally {
    await prisma.$disconnect();
  }
}

const entry = (process.argv[1] ?? "").replace(/\\/g, "/");
if (/\/db-reset\.(ts|js)$/.test(entry)) {
  resetDatabase().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
