import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { AUTH } from "../helpers/auth-paths";
import { closeDb, db } from "../helpers/db";

/**
 * Bill readiness: a project shows "Blocked" until every mandatory item is ticked, then "Ready to submit".
 * Non-destructive: uses a far-future month (unique per run) so real months are untouched; the rows this spec creates
 * (checks, one gate upload) are deleted again in afterAll. Needs at least one project and a checklist template
 * (Bill readiness > Edit checklist items > Load standard items).
 */
test.describe.configure({ mode: "serial" });
onlyProject("desktop");
test.use({ storageState: AUTH.admin });

const month = `2${String(Math.floor(Math.random() * 90) + 10).padStart(3, "0")}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}`;
let projectId = "";
let uploadId = "";

test.afterAll(async () => {
  if (projectId) {
    await db().billReadinessCheck.deleteMany({ where: { projectId, periodMonth: month } });
    if (uploadId) await db().gateAttendanceUpload.deleteMany({ where: { id: uploadId } });
  }
  await closeDb();
});

test("Checklist is Blocked, then Ready once every item is ticked and the gate is reconciled", async ({ page }) => {
  const project = await db().project.findFirst({ where: { deletedAt: null, status: { isActive: true } }, orderBy: { code: "asc" }, select: { id: true } });
  const template = await db().billReadinessTemplateItem.count({ where: { isActive: true, deletedAt: null } });
  test.skip(!project || template === 0, "Needs a project and checklist template items");
  projectId = project!.id;

  await page.goto(`/bill-readiness/${projectId}?month=${month}`);
  await expect(page.getByTestId("br-status-text")).toContainText(/^Blocked: missing/);

  // Tick every tickable item (date defaults to today).
  const open = page.locator('[data-testid^="br-item-"][data-done="false"]').filter({ has: page.locator('[data-testid^="br-done-"]') });
  while ((await open.count()) > 0) {
    const item = open.first();
    await item.locator('[data-testid^="br-ref-"]').fill("E2E-REF");
    await item.locator('[data-testid^="br-done-"]').click();
    await expect(page.getByText(/marked done/i).first()).toBeVisible();
    await page.waitForTimeout(500);
  }

  // Only the derived gate item is left.
  await expect(page.getByTestId("br-status-text")).toHaveText("Blocked: missing Gate attendance reconciled");

  // Reconcile the gate: an upload for the month with no open exceptions (written directly, removed in afterAll).
  const user = await db().user.findFirst({ where: { deletedAt: null }, select: { id: true } });
  const upload = await db().gateAttendanceUpload.create({ data: { projectId, periodMonth: month, fileName: `e2e-${month}.csv`, uploadedById: user!.id } });
  uploadId = upload.id;

  await page.reload();
  await expect(page.getByTestId("br-status-text")).toHaveText("Ready to submit");
});

test("Overview lists the project with its status for the month", async ({ page }) => {
  test.skip(!projectId, "Needs a project");
  await page.goto(`/bill-readiness?month=${month}`);
  await expect(page.getByTestId("br-kpi-ready")).toContainText(/\d+/);
  const code = (await db().project.findUnique({ where: { id: projectId }, select: { code: true } }))!.code;
  await expect(page.getByTestId(`br-row-${code}`).first()).toContainText(/ready to submit/i);
});
