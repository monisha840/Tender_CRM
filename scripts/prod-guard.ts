/**
 * Hard stop for scripts that write to the database (db:reset, seeds, e2e users, Playwright global setup).
 * The live site (https://tender-crm.vercel.app) runs on the SAME Supabase project as dev/test, so any DATABASE_URL
 * pointing at that project is treated as production. Extra markers can be added with PRODUCTION_DB_MARKERS
 * (comma-separated substrings). There is deliberately no override flag: to lift the guard, change PROTECTED_PROJECT_REFS.
 */
export const PROTECTED_PROJECT_REFS = ["zbpshjwfdovoislemhmi"];

export function assertNotProductionDb(script: string, env: NodeJS.ProcessEnv = process.env): void {
  const url = (env.DATABASE_URL ?? "").toLowerCase();
  const markers = [
    ...PROTECTED_PROJECT_REFS,
    ...(env.PRODUCTION_DB_MARKERS ?? "").split(",").map((m) => m.trim().toLowerCase()),
  ].filter(Boolean);
  const hit = markers.find((m) => url.includes(m.toLowerCase()));
  if (hit) {
    throw new Error(
      `${script} refused: DATABASE_URL points at the production Supabase project (matched '${hit}'). ` +
        "The live site shares this database; see docs/progress.md 'Production database guard'.",
    );
  }
}
