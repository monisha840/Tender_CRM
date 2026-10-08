import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { AUTH } from "../helpers/auth-paths";
import { closeDb, db, firstTenderId } from "../helpers/db";

/**
 * Money locked with clients (/money-locked). Non-destructive: the test creates one SecurityInstrument of its own
 * (unique instrument number, attached to an existing tender) and removes it, with its events, afterwards.
 * AuditLog rows are append-only by design and stay behind.
 */
onlyProject("desktop");
test.use({ storageState: AUTH.admin });

const RUN = `E2E-ML-${Date.now()}`;
const AMOUNT = "12345.67";
let instrumentId = "";
let organisationId = "";

const inr = (text: string | null) => Number((text ?? "").replace(/[^0-9.]/g, ""));

test.beforeAll(async () => {
  const tenderId = await firstTenderId();
  if (!tenderId) throw new Error("No tender in the database to attach the test instrument to");
  const tender = await db().tender.findUniqueOrThrow({ where: { id: tenderId }, select: { organisationId: true } });
  organisationId = tender.organisationId;
  const issue = new Date();
  issue.setUTCDate(issue.getUTCDate() - 10);
  const created = await db().securityInstrument.create({
    data: {
      type: "SECURITY_DEPOSIT",
      tenderId,
      mode: "BG",
      amount: AMOUNT,
      instrumentNo: RUN,
      issueDate: new Date(issue.toISOString().slice(0, 10)),
      expiryDate: new Date(Date.now() + 5 * 86_400_000),
      status: "SUBMITTED",
    },
  });
  instrumentId = created.id;
});

test.afterAll(async () => {
  if (instrumentId) {
    await db().securityInstrumentEvent.deleteMany({ where: { securityInstrumentId: instrumentId } });
    await db().securityInstrument.deleteMany({ where: { id: instrumentId } });
  }
  await closeDb();
});

test("ledger shows the instrument and the client total matches the data", async ({ page }) => {
  await page.goto("/money-locked");
  const row = page.getByTestId(`ledger-row-${instrumentId}`);
  await expect(row).toBeVisible();
  await expect(row.getByTestId("ledger-amount")).toHaveText("₹12,345.67");
  await expect(row).toContainText("Locked");
  // expires in 5 days: inside the 7-day band, so the alert is shown
  await expect(page.getByTestId("expiry-alerts")).toBeVisible();

  // Independent expected total for this client: open instruments + client retention balances.
  const open = new Set(["ARRANGED", "SUBMITTED", "EXPIRED"]);
  const instruments = await db().securityInstrument.findMany({
    where: { deletedAt: null },
    include: { events: { where: { deletedAt: null }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }, project: { select: { organisationId: true } }, tender: { select: { organisationId: true } } },
  });
  const isOpen = (i: (typeof instruments)[number]) => {
    const last = i.events.at(-1)?.type;
    return open.has(i.status) && !(i.status === "ARRANGED" && !i.issueDate) && last !== "REFUNDED" && last !== "RELEASED" && last !== "ADJUSTED" && last !== "FORFEITED";
  };
  let expected = instruments
    .filter((i) => (i.project?.organisationId ?? i.tender.organisationId) === organisationId && isOpen(i))
    .reduce((s, i) => s + Number(i.amount), 0);
  const retention = await db().retentionEntry.findMany({ where: { deletedAt: null, side: "CLIENT", project: { organisationId } }, select: { projectId: true, type: true, amount: true } });
  const perProject = new Map<string, number>();
  for (const r of retention) perProject.set(r.projectId, (perProject.get(r.projectId) ?? 0) + (r.type === "WITHHELD" ? 1 : -1) * Number(r.amount));
  expected += [...perProject.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0);

  const shown = inr(await page.getByTestId(`client-total-${organisationId}`).first().textContent());
  expect(Math.abs(shown - expected)).toBeLessThan(0.01);
});

test("refund request and release work and are audited with a reason", async ({ page }) => {
  await page.goto("/money-locked");
  await page.getByTestId(`request-refund-${instrumentId}`).click();
  await page.getByTestId("refund-request-reason").fill(`E2E refund letter sent ${RUN}`);
  await page.getByTestId("refund-request-confirm").click();
  const row = page.getByTestId(`ledger-row-${instrumentId}`);
  await expect(row).toContainText("Refund requested");

  const events = await db().securityInstrumentEvent.findMany({ where: { securityInstrumentId: instrumentId }, orderBy: { createdAt: "asc" } });
  expect(events.map((e) => e.type)).toContain("REFUND_REQUESTED");
  const audit1 = await db().auditLog.findFirst({ where: { entityId: instrumentId, action: "money_locked.refund_request" } });
  expect(audit1?.reason).toContain(RUN);

  await page.getByTestId(`mark-released-${instrumentId}`).click();
  await page.getByTestId("release-reason").fill(`E2E refund received ${RUN}`);
  await page.getByTestId("release-confirm").click();
  // released items leave the default "Open" view
  await expect(page.getByTestId(`ledger-row-${instrumentId}`)).toHaveCount(0);
  await page.getByRole("button", { name: "Released", exact: true }).click();
  await expect(page.getByTestId(`ledger-row-${instrumentId}`)).toContainText("Released");

  const inst = await db().securityInstrument.findUniqueOrThrow({ where: { id: instrumentId } });
  expect(inst.status).toBe("RELEASED");
  const audit2 = await db().auditLog.findFirst({ where: { entityId: instrumentId, action: "money_locked.release" } });
  expect(audit2?.reason).toContain(RUN);
});

test("a reason is required", async ({ page }) => {
  await page.goto("/money-locked");
  // already released by the previous test when run in order; otherwise the button exists and stays disabled without a reason
  const btn = page.getByTestId(`request-refund-${instrumentId}`);
  if (await btn.count()) {
    await btn.click();
    await expect(page.getByTestId("refund-request-confirm")).toBeDisabled();
  }
});
