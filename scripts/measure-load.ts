/**
 * Read-only timing of the server data load against the dev DB.
 *   npm run db:measure            lean (flag-aware) load, 3 runs per flag setting
 *   npm run db:measure -- --full  also times each full loader and the old full load
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_LOADERS, LOADER_NAMES, loadDatabaseForUser } from "../src/lib/data/server/compose";
import { loadDatabaseLean } from "../src/lib/data/server/snapshot";

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  const prisma = new PrismaClient({ datasourceUrl: url + (url.includes("?") ? "&" : "?") + `connection_limit=${process.env.CL ?? 8}&pool_timeout=60` });
  const ur = await prisma.userRole.findFirst({ where: { deletedAt: null, role: { key: "director" }, user: { isActive: true, deletedAt: null } } });
  if (!ur) throw new Error("no director");
  const t0 = Date.now();
  await prisma.$queryRaw`select 1`;
  console.log(`connect+ping ${Date.now() - t0} ms`);
  const t1 = Date.now();
  await prisma.$queryRaw`select 1`;
  console.log(`ping (warm) ${Date.now() - t1} ms`);
  if (process.argv.includes("--full")) {
    for (const n of LOADER_NAMES) {
      const t = Date.now();
      const r = await DEFAULT_LOADERS[n]!(prisma, { userId: ur.userId, allowedRegionIds: null, ownProjectIds: null, employeeId: null });
      const rows = Object.values(r).reduce((a: number, v) => a + (Array.isArray(v) ? v.length : 0), 0);
      console.log(`  loader ${n}: ${Date.now() - t} ms, ${rows} rows`);
    }
    const t = Date.now();
    await loadDatabaseForUser(prisma, ur.userId);
    console.log(`full loadDatabaseForUser ${Date.now() - t} ms`);
  }
  for (const phase67 of [false, true]) {
    for (let i = 0; i < 3; i++) {
      const t = Date.now();
      const { db } = await loadDatabaseLean(prisma, ur.userId, { phase67 });
      const rows = Object.values(db).reduce((a, v) => a + (v as unknown[]).length, 0);
      console.log(`lean phase67=${phase67} run${i + 1}: ${Date.now() - t} ms, ${rows} rows`);
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
