import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { AUTH } from "../helpers/auth-paths";
import { closeDb, findTender, projectForTender } from "../helpers/db";
import { approveInInbox, createTender, newTenderData, openTender, run } from "../helpers/tender-flow";

/** Tender -> GO (Director approves) -> Won -> convert (Director approves) -> project visible. Unique ids, no clean-up. */
test.describe.configure({ mode: "serial" });
onlyProject("desktop");
test.use({ storageState: AUTH.admin });
test.afterAll(closeDb);

const tender = newTenderData();

test("Admin creates a tender and requests GO", async ({ page }) => {
  await createTender(page, tender);
  const detail = await openTender(page, tender);
  await run(page, detail.goNoGo());
  await expect.poll(async () => (await findTender(tender.tenderNo))?.id, "tender saved").toBeTruthy();
});

test("Director approves GO in the approvals inbox", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, storageState: AUTH.director });
  const page = await ctx.newPage();
  await page.goto("/approvals");
  await approveInInbox(page, tender.tenderNo);
  await ctx.close();
});

test("Admin marks the tender Won with a reason", async ({ page }) => {
  const detail = await openTender(page, tender);
  await run(page, detail.markWon(), "Awarded in E2E smoke test");
  await expect.poll(async () => (await findTender(tender.tenderNo))?.currentStage.kind, "tender is in a WON stage").toBe("WON");
});

test("Admin requests conversion and Director approves it", async ({ page, browser, baseURL }) => {
  const detail = await openTender(page, tender);
  await run(page, detail.convert());

  const ctx = await browser.newContext({ baseURL, storageState: AUTH.director });
  const dpage = await ctx.newPage();
  await dpage.goto("/approvals");
  await approveInInbox(dpage, tender.tenderNo);
  await ctx.close();
});

test("The project is visible in /projects with the tender's client and value", async ({ page }) => {
  const t = await findTender(tender.tenderNo);
  await expect.poll(async () => (t ? await projectForTender(t.id) : null), "project created from the tender").not.toBeNull();
  const project = (await projectForTender(t!.id))!;

  await page.goto("/projects");
  const search = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i)).first();
  if (await search.count()) await search.fill(project.name);
  const row = page.getByRole("row").or(page.getByTestId("project-row")).filter({ hasText: project.name }).first();
  await expect(row).toBeVisible();
  // Client name carried over (may be abbreviated to the short name) and value shown as full INR or compact Cr/L.
  await expect(row).toContainText(new RegExp(`${escape(t!.organisation.name)}|${escape(t!.organisation.shortName)}`, "i"));
  await expect(row).toContainText(/1,23,45,678|1\.23\s*Cr/);
});

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
