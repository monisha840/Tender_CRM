import { test as base, expect } from "@playwright/test";

export interface AllowList {
  /** Console error messages matching any of these are ignored. */
  console: RegExp[];
  /** Request URLs (failed or >=400) matching any of these are ignored. */
  requests: RegExp[];
}

/** Fails any test on browser console errors or failed/4xx/5xx network requests (override via `allow`). */
export const test = base.extend<{ allow: AllowList }>({
  allow: [{ console: [], requests: [/favicon\.ico/] }, { option: true }],
  page: async ({ page, allow }, provide) => {
    const problems: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error" && !allow.console.some((r) => r.test(m.text()))) problems.push(`console: ${m.text()}`);
    });
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("requestfailed", (r) => {
      const err = r.failure()?.errorText ?? "";
      // Browser-initiated aborts are not app failures: a navigation superseding an in-flight navigation, or an RSC
      // prefetch (?_rsc=) cancelled by navigation. Nothing broader than ERR_ABORTED on those two kinds is ignored.
      if (/ERR_ABORTED/.test(err) && (r.isNavigationRequest() || /[?&]_rsc=/.test(r.url()))) return;
      if (!allow.requests.some((x) => x.test(r.url()))) problems.push(`requestfailed: ${r.url()} ${err}`);
    });
    page.on("response", (r) => {
      if (r.status() >= 400 && !allow.requests.some((x) => x.test(r.url()))) problems.push(`http ${r.status()}: ${r.url()}`);
    });
    await provide(page);
    expect(problems, "browser errors / failed requests").toEqual([]);
  },
});
export { expect };
