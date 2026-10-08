import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { AUTH } from "../helpers/auth-paths";
import { closeDb, db, findTender } from "../helpers/db";
import { approveInInbox, createTender, newTenderData, openTender, requestGo } from "../helpers/tender-flow";

/**
 * Document vault: a tender whose mandatory document is expired in the vault cannot be marked Submitted.
 * Non-destructive: unique tender and vault titles; the vault document is removed again at the end. The only direct DB
 * write is one TenderDocumentItem on the spec's own tender (new tenders have no document items until the checklist is
 * generated). Needs a DocumentType that has no vault documents yet, otherwise the test skips itself.
 */
test.describe.configure({ mode: "serial" });
onlyProject("desktop");
test.use({ storageState: AUTH.admin });
test.afterAll(closeDb);

const tender = newTenderData();
const stamp = Date.now();
const docTitle = `E2E expired certificate ${stamp}`;
let typeId = "";
let typeName = "";

test("Admin adds an expired certificate to the vault", async ({ page }) => {
  const unused = await db().documentType.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { name: "asc" } });
  let chosen = null as null | { id: string; name: string };
  for (const t of unused) {
    if ((await db().companyDocument.count({ where: { documentTypeId: t.id, deletedAt: null } })) === 0) {
      chosen = t;
      break;
    }
  }
  test.skip(!chosen, "Every document type already has a vault document; cannot isolate an expired one");
  typeId = chosen!.id;
  typeName = chosen!.name;

  await page.goto("/documents");
  await page.getByTestId("doc-add").first().click();
  const form = page.getByTestId("doc-form");
  await form.getByLabel(/document type/i).selectOption({ value: typeId });
  await form.getByLabel(/^title/i).fill(docTitle);
  await form.getByLabel(/expiry date/i).fill("2020-01-01");
  await form.getByRole("button", { name: /save/i }).click();
  await expect(form).toBeHidden({ timeout: 30_000 });

  const row = page.getByTestId(/^doc-row-/).filter({ hasText: docTitle }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(/expired/i);
});

test("Admin creates a tender and gets GO approved", async ({ page, browser, baseURL }) => {
  test.skip(!typeId, "No isolated document type");
  await createTender(page, tender);
  const detail = await openTender(page, tender);
  await requestGo(page, detail);
  const ctx = await browser.newContext({ baseURL, storageState: AUTH.director });
  const dpage = await ctx.newPage();
  await dpage.goto("/approvals");
  await approveInInbox(dpage, tender.tenderNo);
  await ctx.close();
});

test("A tender with an expired mandatory document cannot be marked Submitted", async ({ page }) => {
  test.skip(!typeId, "No isolated document type");
  const t = await findTender(tender.tenderNo);
  await db().tenderDocumentItem.create({ data: { tenderId: t!.id, name: `E2E mandatory ${stamp}`, documentTypeId: typeId, isMandatory: true } });

  await openTender(page, tender);
  await expect(page.getByTestId("tender-docs-panel")).toContainText(typeName);
  await expect(page.getByTestId("tender-docs-blocked")).toBeVisible();

  await page.getByTestId("stage-advance").click();
  await expect(page.getByText(/mandatory documents are expired/i).first()).toBeVisible();
  const after = await findTender(tender.tenderNo);
  expect(after?.currentStage.systemKey).not.toBe("SUBMITTED");
});

test("Admin removes the test certificate again", async ({ page }) => {
  test.skip(!typeId, "No isolated document type");
  await page.goto("/documents");
  const row = page.getByTestId(/^doc-row-/).filter({ hasText: docTitle }).first();
  await row.getByTestId("doc-delete").first().click();
  await page.getByTestId("doc-delete-dialog-reason").fill("E2E clean-up of test certificate");
  await page.getByTestId("doc-delete-dialog-confirm").click();
  await expect(page.getByText(docTitle)).toHaveCount(0, { timeout: 30_000 });
});
