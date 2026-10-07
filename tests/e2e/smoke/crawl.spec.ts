import path from "node:path";
import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { AUTH } from "../helpers/auth-paths";
import { closeDb } from "../helpers/db";
import { expectNoHorizontalOverflow } from "../helpers/overflow";
import { crawlRoutes } from "../helpers/routes";

/**
 * Visits every nav-reachable page per role (PHASE67-flagged pages only when the flag is on) and asserts: page renders,
 * no console errors / failed requests (fixture), no horizontal overflow. One screenshot per page in test-results/crawl.
 */
onlyProject("desktop");
test.afterAll(closeDb);

for (const role of ["admin", "director"] as const) {
  test.describe(`crawl as ${role}`, () => {
    test.use({ storageState: AUTH[role] });

    test(`every page loads cleanly`, async ({ page }, testInfo) => {
      test.setTimeout(300_000);
      for (const route of await crawlRoutes()) {
        await test.step(route, async () => {
          const res = await page.goto(route);
          expect(res?.status(), `${route} status`).toBeLessThan(400);
          await expect(page).not.toHaveURL(/\/login/);
          await expect(page.getByRole("heading").first()).toBeVisible();
          await expectNoHorizontalOverflow(page);
          const slug = route.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-") || "home";
          await page.screenshot({ path: path.join("test-results", "crawl", `${role}-${slug}.png`), fullPage: true });
        });
      }
      testInfo.annotations.push({ type: "role", description: role });
    });
  });
}
