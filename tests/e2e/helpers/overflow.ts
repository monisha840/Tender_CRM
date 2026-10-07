import { expect, type Page } from "@playwright/test";

/** No horizontal page scroll: documentElement.scrollWidth <= clientWidth. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, `page overflows horizontally (${scrollWidth} > ${clientWidth})`).toBeLessThanOrEqual(clientWidth);
}
