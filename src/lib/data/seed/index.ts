import type { Database } from "@/types";
import { seedAccounts } from "./accounts";
import { createRng, emptyDatabase, type SeedCtx } from "./helpers";
import { seedMasters } from "./masters";
import { seedOrg } from "./org";
import { seedParties } from "./parties";
import { seedPayroll } from "./payroll";
import { seedAudit, seedNotifications } from "./platform";
import { seedProjects } from "./projects";
import { seedPurchases } from "./purchases";
import { seedSiteWork } from "./sitework";
import { seedTenders } from "./tenders";
import { seedWorkforce } from "./workforce";

export { SEED_VERSION } from "./helpers";

/**
 * Builds the complete mock database. Fully deterministic: a fixed PRNG seed plus the fixed demo
 * "today" (src/lib/dates.ts) mean every call returns identical data, on the server and in the browser.
 */
export function buildSeedDatabase(): Database {
  const ctx: SeedCtx = { db: emptyDatabase(), rng: createRng(20261007), ref: {} };

  seedOrg(ctx);
  seedMasters(ctx);
  const converted = seedTenders(ctx);
  const projects = seedProjects(ctx, converted);
  seedWorkforce(ctx, projects);
  seedSiteWork(ctx, projects);
  seedParties(ctx, projects);
  seedPurchases(ctx, projects);
  seedAccounts(ctx, projects);
  seedPayroll(ctx);
  seedNotifications(ctx, projects);
  seedAudit(ctx);

  return ctx.db;
}
