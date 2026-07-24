import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  outputDir: path.join(os.tmpdir(), "enshield-playwright-results"),
  use: {
    baseURL: "http://127.0.0.1:4174",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
  webServer: {
    command: "yarn vite --config vite.qa.config.js --host 127.0.0.1 --port 4174",
    url: "http://127.0.0.1:4174/internal-login",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
