import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { AUTH } from "../helpers/auth-paths";
import { closeDb, countActiveTenders } from "../helpers/db";
import { DashboardPage } from "../helpers/pages";

onlyProject("desktop");
test.use({ storageState: AUTH.director });
test.afterAll(closeDb);

test("Director dashboard loads and the active-tenders KPI matches the database", async ({ page }) => {
  const dash = new DashboardPage(page);
  await dash.goto();
  await expect(dash.heading()).toBeVisible();

  // Active = non-deleted tenders in an OPEN stage (mirrors getActiveTenders; see helpers/db.ts).
  const expected = await countActiveTenders();
  const tile = dash.activeTendersTile();
  await expect(tile).toBeVisible();
  await expect
    .poll(async () => Number(/\d[\d,]*/.exec(await tile.innerText())?.[0].replace(/,/g, "")), "active tenders KPI value")
    .toBe(expected);
});
