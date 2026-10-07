import { expect, type Locator, type Page } from "@playwright/test";
import { TenderDetailPage, TendersListPage } from "./pages";
import { completeDialogIfShown, fillDate, fillField, isoInDays, orTestId } from "./ui";

export interface NewTender {
  tenderNo: string;
  title: string;
  /** Estimated value in rupees as typed into the form. */
  value: number;
}

/** Unique per run (timestamp + random) so reruns never collide and no clean-up is needed. */
export function newTenderData(): NewTender {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 90 + 10)}`;
  return { tenderNo: `E2E/${stamp}`, title: `E2E smoke tender ${stamp}`, value: 12_345_678 };
}

/** Admin: register a tender through the form. Required fields are not known up front, so every known field that exists is filled. */
export async function createTender(page: Page, t: NewTender): Promise<void> {
  await new TendersListPage(page).goto();
  await new TendersListPage(page).create().click();
  // The tender form is a side sheet (dialog); scope to it so the list filters behind it (also labelled Region/Organisation) are not matched.
  const form = page.getByRole("dialog");
  await fillField(page, /tender\s*(no|number)|reference/i, t.tenderNo, "tender-no-input", form);
  await fillField(page, /^(tender\s*)?title|name/i, t.title, "tender-title-input", form);
  await fillField(page, /work description|description|scope/i, "E2E smoke test work description", undefined, form);
  await fillField(page, /eligibility/i, "E2E smoke test eligibility", undefined, form);
  await fillField(page, /location/i, "Raichur", undefined, form);
  await fillField(page, /client|organi[sz]ation|department|customer/i, "", "tender-client-select", form);
  await fillField(page, /region/i, "", undefined, form);
  await fillField(page, /service line/i, "", undefined, form);
  await fillField(page, /tender type|type/i, "", undefined, form);
  await fillField(page, /estimated value|value|amount/i, String(t.value), "tender-value-input", form);
  await fillField(page, /^emd|earnest/i, "100000", undefined, form);
  await fillField(page, /fee/i, "1000", undefined, form);
  await fillDate(page, /opening/i, isoInDays(1), undefined, form);
  await fillDate(page, /submission|deadline|due/i, isoInDays(30), "tender-deadline-input", form);
  await orTestId(page, form.getByRole("button", { name: /^(save|create|register|submit|add)\b/i }), "tender-save").last().click();
  // The server action (insert + audit in one transaction) can take a while on a cold dev server: wait for the sheet to close.
  await expect(form).toBeHidden({ timeout: 60_000 });
  await expect(page.getByText(t.tenderNo).first()).toBeVisible();
}

/** Open the tender's detail page from the list (searching first when a search box exists). */
export async function openTender(page: Page, t: NewTender): Promise<TenderDetailPage> {
  const list = new TendersListPage(page);
  await list.goto();
  const search = page.getByRole("searchbox").or(page.getByPlaceholder(/search/i)).first();
  if (await search.count()) await search.fill(t.tenderNo);
  const link = page.getByRole("link", { name: t.tenderNo }).or(page.getByTestId("tender-row").filter({ hasText: t.tenderNo }).getByRole("link")).first();
  await link.click();
  await expect(page.getByText(t.tenderNo).first()).toBeVisible();
  return new TenderDetailPage(page);
}

/**
 * Real workflow: a New tender is first moved to Under Evaluation; only there can GO be requested.
 * Moves it along when needed, then requests GO and completes the dialog.
 */
export async function requestGo(page: Page, detail: TenderDetailPage): Promise<void> {
  const move = page.getByTestId("stage-advance");
  if (await move.filter({ hasText: /under evaluation/i }).isVisible()) await move.click();
  await run(page, detail.goNoGo());
}

/** After GO approval the tender sits in Bid Preparing; mark it Submitted (the stage the Won action needs). */
export async function advanceToSubmitted(page: Page): Promise<void> {
  const advance = page.getByTestId("stage-advance");
  await expect(advance.or(page.getByTestId("mark-won")).first()).toBeVisible();
  for (let i = 0; i < 3 && !(await page.getByTestId("mark-won").isVisible()); i++) {
    await advance.click();
    await expect(advance.or(page.getByTestId("mark-won")).first()).toBeVisible();
  }
}

/** Click an action on the detail page and finish its confirmation dialog (if any). */
export async function run(page: Page, button: Locator, reason?: string): Promise<void> {
  await expect(button).toBeVisible();
  await button.click();
  await completeDialogIfShown(page, reason);
}

/** Director inbox: approve the still-pending request whose title mentions the tender number. */
export async function approveInInbox(page: Page, tenderNo: string): Promise<void> {
  const btn = approveControl(page, tenderNo);
  await expect(btn.first()).toBeVisible();
  await btn.first().click();
  await completeDialogIfShown(page, "Approved in E2E smoke test");
  await expect(btn).toHaveCount(0);
}

/** Enabled/visible approve controls inside inbox rows that mention the tender number. */
export function approveControl(page: Page, tenderNo: string): Locator {
  const rows = page.getByRole("row").or(page.getByTestId("approvals-row")).filter({ hasText: tenderNo });
  return rows.getByRole("button", { name: /^approve\b/i }).or(rows.getByTestId("approve"));
}

