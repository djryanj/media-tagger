import { defineConfig, devices } from "@playwright/test";

const mobileFirefoxUserAgent =
  "Mozilla/5.0 (Android 14; Mobile; rv:137.0) Gecko/137.0 Firefox/137.0";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  reporter: [["list"], ["html", { outputFolder: "./playwright-report", open: "never" }]],
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm --dir ../.. start:prod",
    url: "http://127.0.0.1:3000/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
      },
    },
    {
      name: "mobile-firefox",
      use: {
        browserName: "firefox",
        hasTouch: true,
        userAgent: mobileFirefoxUserAgent,
        viewport: {
          width: 412,
          height: 915,
        },
      },
    },
  ],
});