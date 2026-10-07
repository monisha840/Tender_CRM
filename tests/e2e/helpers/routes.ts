import { NAV_MODULES } from "../../../src/lib/nav";
import { isModuleEnabled } from "../../../src/lib/features";
import { firstProjectId, firstSubcontractorId, firstTenderId } from "./db";

/**
 * Pages reachable from the nav (src/lib/nav.ts), honouring the PHASE67 flag (employees, finance are only crawled when
 * enabled; the flag resolves from the same env as the app because playwright.config.ts loads .env.local).
 */
export function navRoutes(): string[] {
  return NAV_MODULES.filter((m) => m.inNav !== false && isModuleEnabled(m.key)).map((m) => m.href);
}

/** Nav routes plus the sub-pages that exist today (deadlines, one detail page per list). */
export async function crawlRoutes(): Promise<string[]> {
  const routes = new Set<string>(navRoutes());
  routes.add("/tenders/deadlines");
  const [t, p, s] = await Promise.all([firstTenderId(), firstProjectId(), firstSubcontractorId()]);
  if (t) routes.add(`/tenders/${t}`);
  if (p) routes.add(`/projects/${p}`);
  if (s) routes.add(`/subcontractors/${s}`);
  return [...routes];
}
