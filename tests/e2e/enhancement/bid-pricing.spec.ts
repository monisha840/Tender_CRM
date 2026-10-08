import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { AUTH } from "../helpers/auth-paths";

onlyProject("desktop");
test.use({ storageState: AUTH.admin });

test("a below-cost quote shows the warning (nothing is saved)", async ({ page }) => {
  await page.goto("/bid-pricing");
  await expect(page.getByTestId("pricing-row").first()).toBeVisible();
  await page.getByTestId("pricing-row").first().getByRole("link").first().click();

  await expect(page.getByTestId("pricing-panel")).toBeVisible();
  await page.getByTestId("pricing-manpower").fill("20");
  await page.getByTestId("pricing-days").fill("100");
  // A planned wage makes the cost positive even when no minimum-wage rate is on file.
  await page.getByTestId("pricing-wage").fill("600");
  await page.getByTestId("pricing-quote").fill("1000");

  await expect(page.getByTestId("pricing-warning-BELOW_COST")).toBeVisible();
  await expect(page.getByTestId("pricing-total-cost")).not.toHaveText(/^₹0$/);

  // A realistic quote clears the warning.
  await page.getByTestId("pricing-quote").fill("9000000");
  await expect(page.getByTestId("pricing-warning-BELOW_COST")).toHaveCount(0);
});
