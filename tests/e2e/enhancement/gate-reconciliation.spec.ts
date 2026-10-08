import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "../helpers/fixtures";
import { onlyProject } from "../helpers/project-gate";
import { AUTH } from "../helpers/auth-paths";

// Expected mismatch counts for the demo file are documented in docs/gate-demo.md and pinned in
// src/modules/gate-reconciliation/__tests__/gate.test.ts.
onlyProject("desktop");
test.use({ storageState: AUTH.admin });

test("uploading the demo gate file shows the planted mismatches", async ({ page }) => {
  const csv = readFileSync(path.join(process.cwd(), "public", "demo", "gate-attendance-demo.csv"));

  await page.goto("/gate-reconciliation");
  await expect(page.getByTestId("gate-upload-panel")).toBeVisible();

  const project = page.getByTestId("gate-project");
  await project.selectOption({ label: (await project.locator("option", { hasText: "SPH-CG-001" }).first().innerText()).trim() });
  await page.getByTestId("gate-month").fill("2026-08");
  // Unique file name so this run is identifiable in the upload history (a re-upload replaces the previous one for the month).
  await page.getByTestId("gate-file").setInputFiles({ name: `e2e-gate-${Date.now()}.csv`, mimeType: "text/csv", buffer: csv });

  await expect(page.getByTestId("gate-preview")).toContainText("513");
  await page.getByTestId("gate-upload").click();

  await expect(page).toHaveURL(/\/gate-reconciliation\/.+/);
  await expect(page.getByTestId("gate-summary")).toContainText("11 exceptions");
  await expect(page.getByTestId("gate-kind-count-MISSING_IN_OURS")).toHaveText("3");
  await expect(page.getByTestId("gate-kind-count-MISSING_IN_THEIRS")).toHaveText("4");
  await expect(page.getByTestId("gate-kind-count-HOURS_MISMATCH")).toHaveText("2");
  await expect(page.getByTestId("gate-kind-count-SHIFT_MISMATCH")).toHaveText("2");
  await expect(page.getByTestId("gate-exception-row")).toHaveCount(22); // table + mobile card list are both in the DOM
});
