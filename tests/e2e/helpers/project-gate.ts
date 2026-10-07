import { test } from "@playwright/test";

/** Skip every test in the calling file unless it runs in the named Playwright project ("desktop" | "mobile"). */
export function onlyProject(name: "desktop" | "mobile"): void {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(testInfo.project.name !== name || !browserName, `${name} project only`);
  });
}
