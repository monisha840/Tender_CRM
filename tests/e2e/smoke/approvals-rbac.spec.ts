import type { Request } from "@playwright/test";
import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { AUTH } from "../helpers/auth-paths";
import { closeDb, findTender, latestApproval } from "../helpers/db";
import { approveControl, createTender, newTenderData, openTender, requestGo } from "../helpers/tender-flow";
import { TenderDetailPage } from "../helpers/pages";

/**
 * Admin (maker) must not be able to approve: not in the UI and, more importantly, not on the server.
 *
 * Direct server-call approach (no extra script, no service-role key):
 *  1. Admin registers a tender and requests GO, which creates a PENDING approval request.
 *  2. A Director browser context clicks Approve in the inbox. A route handler captures the resulting Next server-action
 *     POST (URL, `next-action` id, `content-type`, body) and answers it with a dummy 200 so the real action never runs.
 *  3. The captured request is replayed through the ADMIN session (`adminContext.request.post`, which sends the admin
 *     cookies). The server must refuse; the DB must still show the request PENDING with no recorded decision.
 * This exercises exactly what a malicious Admin could forge by hand-crafting the server-action call.
 */
onlyProject("desktop");
test.use({ storageState: AUTH.admin });
test.afterAll(closeDb);

test("Admin cannot approve: no control in the UI and a forged server call is rejected", async ({ page, browser, baseURL }) => {
  const tender = newTenderData();
  await createTender(page, tender);
  const detail = await openTender(page, tender);
  await requestGo(page, detail);

  const row = await findTender(tender.tenderNo);
  expect(row, "tender was created").not.toBeNull();
  const tenderId = row!.id;
  await expect.poll(async () => (await latestApproval(tenderId))?.status, "GO request is pending").toBe("PENDING");

  // --- UI: Admin sees no usable approve control in the inbox or on the tender page.
  await page.goto("/approvals");
  await expect(page.getByRole("heading").first()).toBeVisible();
  const adminApprove = approveControl(page, tender.tenderNo);
  for (const i of Array.from({ length: await adminApprove.count() }, (_, n) => n)) await expect(adminApprove.nth(i)).toBeDisabled();
  await openTender(page, tender);
  await expect(new TenderDetailPage(page).heading()).toBeVisible();
  await expect(page.getByRole("button", { name: /^approve\b/i }).or(page.getByTestId("approve"))).toHaveCount(0);

  // --- Capture the Director's approve call (never executed).
  const director = await browser.newContext({ baseURL, storageState: AUTH.director });
  const dpage = await director.newPage();
  let captured: Request | undefined;
  await dpage.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      captured = req;
      await route.fulfill({ status: 200, contentType: "text/x-component", body: '0:{"a":"$@1"}\n1:null\n' });
    } else await route.continue();
  });
  await dpage.goto("/approvals");
  const btn = approveControl(dpage, tender.tenderNo).first();
  await expect(btn).toBeVisible();
  await btn.click();
  const dialog = dpage.getByRole("dialog").or(dpage.getByRole("alertdialog")).first();
  if (await dialog.isVisible()) {
    const box = dialog.getByRole("textbox").first();
    if (await box.count()) await box.fill("capture only");
    await dialog.getByRole("button", { name: /^(confirm|approve|submit|yes)/i }).last().click();
  }
  await expect.poll(() => captured, "server action POST captured").toBeDefined();
  const req = captured!;
  const headers = Object.fromEntries(
    Object.entries(req.headers()).filter(([k]) => ["next-action", "next-router-state-tree", "content-type", "accept"].includes(k)),
  );
  const body = req.postDataBuffer() ?? undefined;
  await director.close();

  // --- Replay with the ADMIN session.
  const res = await page.context().request.post(req.url(), { headers, data: body, failOnStatusCode: false });
  const text = await res.text();
  expect(text, "server must not report success").not.toMatch(/"status":"APPROVED"|"ok":true/);

  const after = await latestApproval(tenderId);
  expect(after?.status, "request is still pending after the forged call").toBe("PENDING");
  expect(after?.steps.flatMap((s) => s.actions), "no decision recorded").toHaveLength(0);
});

// Maker-checker for a Director who also requested the approval cannot be exercised in the 2-role minimal scope:
// only the System Admin submits requests (the Director only decides), so there is no Director-requested item.
// The rule is covered by tests/integration/approvals-audit.test.ts (SELF_APPROVAL).
test.fixme("Director cannot approve a request they submitted themselves", () => {});
