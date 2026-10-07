import { expect, type Locator, type Page } from "@playwright/test";
import { USERS, password, type RoleKey } from "./users";

/** Semantic locator first, `data-testid` fallback (see docs/e2e-testids.md). Specs survive either one drifting. */
export const orTestId = (page: Page, semantic: Locator, testId: string): Locator => semantic.or(page.getByTestId(testId));

export const userMenu = (page: Page): Locator => orTestId(page, page.getByRole("button", { name: /account menu/i }), "user-menu");

export async function loginViaUi(page: Page, role: RoleKey, pw: string = password()): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(USERS[role].email);
  await page.getByLabel(/password/i).fill(pw);
  await page.getByRole("button", { name: /sign in/i }).click();
  // The server action + first dashboard compile on a cold `next dev` can exceed the default 5s assertion timeout.
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 45_000 });
}

export async function signOut(page: Page): Promise<void> {
  await userMenu(page).click();
  await orTestId(page, page.getByRole("menuitem", { name: /sign out/i }).or(page.getByRole("button", { name: /sign out/i })), "sign-out")
    .first()
    .click();
}

/** Primary action button/link by accessible name, falling back to a testid. */
export const action = (page: Page, name: RegExp, testId: string): Locator =>
  orTestId(page, page.getByRole("button", { name }).or(page.getByRole("link", { name })), testId).first();

/**
 * If an action opens a confirmation dialog (reason box + confirm button), complete it. Waits a few seconds for the
 * dialog; if none appears the action was direct and nothing more is done.
 */
export async function completeDialogIfShown(page: Page, reason = "E2E smoke test"): Promise<void> {
  const dialog = page.getByRole("dialog").or(page.getByRole("alertdialog")).first();
  const shown = await dialog.waitFor({ state: "visible", timeout: 3_000 }).then(
    () => true,
    () => false,
  );
  if (!shown) return;
  const box = dialog.getByRole("textbox").first();
  if (await box.count()) await box.fill(reason);
  await orTestId(
    page,
    dialog.getByRole("button", { name: /^(confirm|submit|send|yes|approve|reject|save|convert|mark|request|continue)/i }),
    "dialog-confirm",
  )
    .last()
    .click();
  await expect(dialog).toBeHidden();
}

/** Fill a text-like field by label (or testid); choose the first option for selects/comboboxes. False when absent. */
export async function fillField(page: Page, label: RegExp, value: string, testId?: string, scope: Page | Locator = page): Promise<boolean> {
  let field = scope.getByLabel(label).first();
  if (testId) field = field.or(scope.getByTestId(testId)).first();
  if ((await field.count()) === 0) return false;
  const tag = await field.evaluate((el) => el.tagName.toLowerCase());
  const role = await field.getAttribute("role");
  if (tag === "select") {
    await field.selectOption({ index: 1 }).catch(() => field.selectOption({ index: 0 }));
  } else if (role === "combobox" || tag === "button") {
    await field.click();
    const opt = page.getByRole("option").first(); // option popups render in a portal, so search the whole page
    await opt.waitFor();
    await opt.click();
  } else {
    await field.fill(value);
  }
  return true;
}

/** Date input (date / datetime-local) or DD-MM-YYYY text. False when absent. */
export async function fillDate(page: Page, label: RegExp, iso: string, testId?: string, scope: Page | Locator = page): Promise<boolean> {
  let field = scope.getByLabel(label).first();
  if (testId) field = field.or(scope.getByTestId(testId)).first();
  if ((await field.count()) === 0) return false;
  const type = await field.getAttribute("type");
  if (type === "date") await field.fill(iso);
  else if (type === "datetime-local") await field.fill(`${iso}T10:00`);
  else {
    const [y, m, d] = iso.split("-");
    await field.fill(`${d}-${m}-${y}`);
  }
  return true;
}

/** ISO date `days` from today (UTC date is fine for a deadline in the future). */
export const isoInDays = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
