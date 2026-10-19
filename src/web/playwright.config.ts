import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against the built app (the standalone server, as in the container) and e2e/mock-server.mjs,
// which stands in for both the identity server and the bjk-core API. No real services are needed.
const MOCK = "http://localhost:4010";
const APP = "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["json", { outputFile: "test-results/results.json" }]] : "list",
  use: {
    baseURL: APP,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
      testIgnore: /mobile\.spec/,
    },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    {
      command: "node e2e/mock-server.mjs",
      url: `${MOCK}/health`,
      reuseExistingServer: !process.env.CI,
      env: { PORT: "4010", MOCK_WEB_ORIGIN: APP },
    },
    {
      command: "node scripts/start-standalone.mjs",
      url: `${APP}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        PORT: "3000",
        HOSTNAME: "localhost",
        APP_URL: APP,
        API_BASE_URL: MOCK,
        IDSRV_AUTHORITY: MOCK,
        IDSRV_CLIENT_ID: "bjk-web",
        IDSRV_CLIENT_SECRET: "e2e-secret",
        IDSRV_ALLOW_HTTP: "true",
        AUTH_SECRET: "e2e-auth-secret-that-is-at-least-32-characters-long",
        TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
        MEDIA_ORIGINS: MOCK,
        UPLOAD_ORIGINS: MOCK,
      },
    },
  ],
});
