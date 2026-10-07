import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { AUTH } from "../helpers/auth-paths";
import { expectNoHorizontalOverflow } from "../helpers/overflow";

/** 360px viewport (mobile project): dashboard and tender list render without horizontal scroll or console errors. */
onlyProject("mobile");
test.use({ storageState: AUTH.director });

for (const route of ["/dashboard", "/tenders"]) {
  test(`${route} renders at 360px without overflow`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const res = await page.goto(route);
    expect(res?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    if (route === "/tenders") {
      // Rows become stacked cards on mobile: either table rows or tender-row cards.
      await expect(page.getByRole("row").or(page.getByTestId("tender-row")).first()).toBeVisible();
    }
  });
}
