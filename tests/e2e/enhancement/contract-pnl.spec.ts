import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { AUTH } from "../helpers/auth-paths";
import { closeDb, db } from "../helpers/db";

/** Contract P&L (/contract-pnl and the Profit & Loss tab). Read-only: checks displayed figures against the database. */
onlyProject("desktop");
test.use({ storageState: AUTH.director });
test.afterAll(closeDb);

const inr = (text: string | null) => Number((text ?? "").replace(/[^0-9.-]/g, ""));

/** A demo project that has been invoiced (so a margin exists). */
async function knownProject() {
  const invoice = await db().invoice.findFirst({ where: { deletedAt: null, project: { deletedAt: null } }, orderBy: { taxableValue: "desc" }, select: { projectId: true } });
  if (!invoice) throw new Error("No invoiced project in the demo data");
  return db().project.findUniqueOrThrow({ where: { id: invoice.projectId }, select: { id: true, code: true, name: true } });
}

test("the Profit & Loss tab shows billed, sub cost and a margin that adds up", async ({ page }) => {
  const project = await knownProject();
  const billedExpected = (await db().invoice.findMany({ where: { projectId: project.id, deletedAt: null }, select: { taxableValue: true } })).reduce((s, i) => s + Number(i.taxableValue), 0);
  const subExpected = (
    await db().subcontractorBill.findMany({ where: { projectId: project.id, deletedAt: null, status: { in: ["APPROVED", "PARTLY_PAID", "PAID"] } }, select: { grossAmount: true } })
  ).reduce((s, b) => s + Number(b.grossAmount), 0);

  await page.goto(`/projects/${project.id}`);
  await page.getByRole("tab", { name: "Profit & Loss" }).click();
  await expect(page.getByTestId("project-pnl")).toBeVisible();

  const billed = inr(await page.getByTestId("pnl-billed").textContent());
  const sub = inr(await page.getByTestId("pnl-sub-cost").textContent());
  const labour = inr(await page.getByTestId("pnl-labour-cost").textContent());
  const other = inr(await page.getByTestId("pnl-other-cost").textContent());
  const total = inr(await page.getByTestId("pnl-total-cost").textContent());
  const margin = inr(await page.getByTestId("pnl-margin").textContent());
  const pct = inr(await page.getByTestId("pnl-margin-pct").textContent());

  expect(Math.abs(billed - billedExpected)).toBeLessThan(0.01);
  expect(Math.abs(sub - subExpected)).toBeLessThan(0.01);
  expect(Math.abs(total - (sub + labour + other))).toBeLessThan(0.02);
  expect(Math.abs(margin - (billed - total))).toBeLessThan(0.02);
  if (billed > 0) expect(Math.abs(pct - (margin / billed) * 100)).toBeLessThan(0.06);
});

test("the portfolio lists the same margin for that project", async ({ page }) => {
  const project = await knownProject();
  await page.goto("/contract-pnl");
  await expect(page.getByTestId("kpi-pnl-margin")).toBeVisible();
  const row = page.getByTestId(`pnl-row-${project.code}`).first();
  await expect(row).toBeVisible();

  await page.goto(`/projects/${project.id}`);
  await page.getByRole("tab", { name: "Profit & Loss" }).click();
  const pctTab = await page.getByTestId("pnl-margin-pct").textContent();
  await page.goto("/contract-pnl");
  await expect(page.getByTestId(`pnl-row-${project.code}`).first().getByTestId("pnl-row-pct")).toHaveText(pctTab ?? "");
});

test("the page works at phone width without horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/contract-pnl");
  await expect(page.getByRole("heading", { name: "Contract P&L" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
