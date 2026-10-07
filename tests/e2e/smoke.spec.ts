import { test, expect } from "@playwright/test";

test("app responds", async ({ request, baseURL }) => {
  const res = await request.get(baseURL!);
  expect(res.status()).toBeLessThan(500);
});
