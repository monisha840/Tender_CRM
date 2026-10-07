import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { LoginPage } from "../helpers/pages";
import { USERS, password, type RoleKey } from "../helpers/users";
import { loginViaUi, signOut, userMenu } from "../helpers/ui";

// Fresh, logged-out browser context for every test in this file. Desktop only (mobile login adds nothing).
test.use({ storageState: { cookies: [], origins: [] } });
onlyProject("desktop");

for (const role of ["admin", "director"] as RoleKey[]) {
  test(`${role} can sign in and sees the app shell with name and role`, async ({ page }) => {
    await loginViaUi(page, role);
    await expect(page).not.toHaveURL(/\/login/);
    // Account menu carries "Account menu: <name>, <role>" as its accessible name (src/components/layout/user-menu.tsx).
    await expect(userMenu(page)).toBeVisible();
    await expect(userMenu(page)).toHaveAccessibleName(USERS[role].roleLabel);
    await expect(userMenu(page)).toHaveAccessibleName(new RegExp(USERS[role].name, "i"));
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });
}

test("sign out returns to the login page and protects the app", async ({ page }) => {
  await loginViaUi(page, "admin");
  await expect(userMenu(page)).toBeVisible();
  await signOut(page);
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/tenders");
  await expect(page).toHaveURL(/\/login/);
});

test("unauthenticated /tenders redirects to /login", async ({ page }) => {
  await page.goto("/tenders");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("wrong password shows an error and stays on /login", async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await login.login(USERS.admin.email, `${password()}-wrong`);
  await expect(login.error().first()).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
  await expect(userMenu(page)).toHaveCount(0);
});
