import { test as setup, expect } from "@playwright/test";
import path from "node:path";

export const AUTH = {
  admin: path.join(__dirname, ".auth", "admin.json"),
  director: path.join(__dirname, ".auth", "director.json"),
};

// TODO-verify: written against the PLANNED login UI (/login, labels "Email" and "Password",
// submit button "Sign in", redirect away from /login on success). Adjust once S2 lands the real page.
for (const [role, email] of [
  ["admin", "admin@sprince.example"],
  ["director", "a.joseph.stalin@sprince.example"],
] as const) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    const res = await page.goto("/login");
    // Login page not built yet (S2): skip rather than block the other specs.
    setup.skip(!res || res.status() === 404, "TODO-verify: /login not implemented yet");
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(process.env.E2E_TEST_PASSWORD ?? "");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.context().storageState({ path: AUTH[role] });
  });
}
