import { test as setup, expect } from "@playwright/test";
import { AUTH } from "./helpers/auth-paths";
import { USERS } from "./helpers/users";

// Logs in through the real UI (/login, labels "Email"/"Password", button "Sign in") as the seeded demo users and saves
// the browser state for the specs. Password: E2E_TEST_PASSWORD from .env.local (never printed).
for (const role of ["admin", "director"] as const) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(USERS[role].email);
    await page.getByLabel(/password/i).fill(process.env.E2E_TEST_PASSWORD ?? "");
    await page.getByRole("button", { name: /sign in/i }).click();
    // Cold `next dev` compiles /dashboard on first login (>5s), so allow a longer navigation window.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 45_000 });
    await page.context().storageState({ path: AUTH[role] });
  });
}
