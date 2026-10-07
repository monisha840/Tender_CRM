import { assertSafeToReset, resetDatabase } from "../../scripts/db-reset";
import { ensureE2eUsers } from "../../scripts/e2e-users";

/** Refuses to run outside development/test; resets DB (base + demo seed) and ensures the two test users. */
export default async function globalSetup(): Promise<void> {
  const appEnv = process.env.APP_ENV;
  if (appEnv !== "development" && appEnv !== "test") {
    throw new Error(`E2E refused: APP_ENV must be 'development' or 'test' (got '${appEnv ?? "unset"}').`);
  }
  assertSafeToReset(); // also rejects a production-marked DATABASE_URL
  if (process.env.E2E_SKIP_RESET !== "true") await resetDatabase({ demo: true });
  await ensureE2eUsers();
}
