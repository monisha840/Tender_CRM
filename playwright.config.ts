import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

// Load .env.local (never printed). Node >= 20.12.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PORT = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${PORT}`;
// E2E_SERVER=dev uses `next dev`; default builds and starts for stability.
const serverCmd =
  process.env.E2E_SERVER === "dev"
    ? `npm run dev -- -p ${PORT}`
    : `npm run build && npm run start -- -p ${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.(spec|setup)\.ts/,
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: serverCmd,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 600_000,
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
    {
      name: "mobile",
      // Phone profile in Chromium (Pixel 7 is chromium-based), forced to 360x740.
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 740 } },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
