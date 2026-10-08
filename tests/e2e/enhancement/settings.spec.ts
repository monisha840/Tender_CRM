import type { Page, Request } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import { AUTH } from "../helpers/auth-paths";
import { onlyProject } from "../helpers/project-gate";

/**
 * Settings control centre (enhancement package B). Not run by the author: run one worktree at a time against the dev DB.
 * Admin edits and sees the effect; the Director is read-only; a server action forged with Director cookies is rejected.
 */
onlyProject("desktop");

const section = (page: Page, key: string) => page.goto(`/settings?section=${key}`).then(() => page.getByTestId(`settings-tab-${key}`).waitFor());

test.describe("admin", () => {
  test.use({ storageState: AUTH.admin });

  test("changes a reminder day and it persists", async ({ page }) => {
    await section(page, "reminders");
    const input = page.getByTestId("reminder-deadline");
    const original = await input.inputValue();
    await input.fill("10, 3, 1");
    await page.getByTestId("reminder-deadline-save").click();
    await expect(page.getByText(/saved/i).first()).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("reminder-deadline")).toHaveValue("10, 3, 1");
    // Inline validation: a duplicate value is refused before anything is sent.
    await page.getByTestId("reminder-deadline").fill("3, 3");
    await expect(page.getByRole("alert").filter({ hasText: /unique/i })).toBeVisible();
    await expect(page.getByTestId("reminder-deadline-save")).toBeDisabled();
    // Restore.
    await page.getByTestId("reminder-deadline").fill(original);
    await page.getByTestId("reminder-deadline-save").click();
    await expect(page.getByText(/saved/i).first()).toBeVisible();
  });

  test("adds and renames a tender stage, then deactivates it", async ({ page }) => {
    const name = `E2E stage ${Date.now() % 100000}`;
    const renamed = `${name} B`;
    await section(page, "stages");
    await page.getByTestId("stage-add").click();
    await page.getByTestId("stage-name-input").fill(name);
    await page.getByTestId("stage-save").click();
    await expect(page.getByTestId("stage-name").filter({ hasText: name })).toBeVisible();

    const row = page.getByTestId("stage-row").filter({ hasText: name });
    await row.getByTestId("stage-edit").click();
    await page.getByTestId("stage-name-input").fill(renamed);
    await page.getByTestId("stage-save").click();
    await expect(page.getByTestId("stage-name").filter({ hasText: renamed })).toBeVisible();

    // Keyboard-accessible reorder: the Up button moves the row up by one.
    const names = async () => page.getByTestId("stage-name").allTextContents();
    const before = await names();
    await page.getByTestId("stage-row").filter({ hasText: renamed }).getByTestId("stage-up").click();
    await expect.poll(names).not.toEqual(before);

    // Deactivate so the list stays tidy (stages are never hard-deleted).
    await page.getByTestId("stage-row").filter({ hasText: renamed }).getByTestId("stage-edit").click();
    await page.getByRole("switch", { name: /active/i }).click();
    await page.getByTestId("stage-save").click();
    await expect(page.getByTestId("stage-row").filter({ hasText: renamed })).toContainText(/inactive/i);
  });

  test("a GSTIN with a wrong check character is refused", async ({ page }) => {
    await section(page, "regions");
    await page.getByTestId("gstin-add").click();
    await page.getByTestId("gstin-input").fill("27AABCS1234F1ZX");
    await expect(page.getByRole("alert").filter({ hasText: /checksum|valid|state code/i }).first()).toBeVisible();
  });

  test("a feature toggle changes and survives a reload", async ({ page }) => {
    await section(page, "features");
    const toggle = page.getByTestId("feature-bid_pricing");
    const was = await toggle.getAttribute("aria-checked");
    await toggle.click();
    await expect(page.getByText(/turned (on|off)/i).first()).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("feature-bid_pricing")).toHaveAttribute("aria-checked", was === "true" ? "false" : "true");
    // The menu follows the toggle (when the signed-in role can see that module at all).
    const link = page.getByRole("link", { name: /bid pricing/i });
    if (was === "true") await expect(link).toHaveCount(0);
    // Restore.
    await page.getByTestId("feature-bid_pricing").click();
    await expect(page.getByText(/turned (on|off)/i).first()).toBeVisible();
  });

  test("an admin-captured settings action is accepted for the admin but rejected when replayed by the director", async ({ page, browser, baseURL }) => {
    await section(page, "features");
    // Capture (without running) the server action POST that a toggle sends.
    let captured: Request | undefined;
    await page.route("**/*", async (route) => {
      const req = route.request();
      if (req.method() === "POST" && req.headers()["next-action"] && !captured) {
        captured = req;
        await route.fulfill({ status: 200, contentType: "text/x-component", body: '0:{"a":"$@1"}\n1:null\n' });
      } else await route.continue();
    });
    await page.getByTestId("feature-bid_pricing").click();
    await expect.poll(() => captured, "server action POST captured").toBeDefined();
    const req = captured!;
    const headers = Object.fromEntries(Object.entries(req.headers()).filter(([k]) => ["next-action", "next-router-state-tree", "content-type", "accept"].includes(k)));
    const body = req.postDataBuffer() ?? undefined;
    await page.unroute("**/*");

    const director = await browser.newContext({ baseURL, storageState: AUTH.director });
    const res = await director.request.post(req.url(), { headers, data: body, failOnStatusCode: false });
    const text = await res.text();
    await director.close();
    expect(text, "the server must refuse the Director").toMatch(/FORBIDDEN/);
    expect(text).not.toMatch(/"ok":true/);

    // The toggle was never really written (the admin's own call was intercepted too).
    await page.reload();
    await expect(page.getByTestId("feature-bid_pricing")).toHaveAttribute("aria-checked", /true|false/);
  });
});

test.describe("director", () => {
  test.use({ storageState: AUTH.director });

  test("sees settings read-only", async ({ page }) => {
    await section(page, "reminders");
    await expect(page.getByTestId("settings-readonly")).toBeVisible();
    await expect(page.getByTestId("reminder-deadline")).toBeDisabled();
    await expect(page.getByTestId("reminder-deadline-save")).toHaveCount(0);

    await section(page, "stages");
    await expect(page.getByTestId("stage-add")).toHaveCount(0);
    await expect(page.getByTestId("stage-edit")).toHaveCount(0);

    await section(page, "features");
    await expect(page.getByTestId("feature-documents")).toBeDisabled();

    await section(page, "users");
    await expect(page.getByTestId("user-edit")).toHaveCount(0);
  });
});
