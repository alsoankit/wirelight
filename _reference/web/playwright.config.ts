import { defineConfig, devices } from "@playwright/test";

// Locally, use the installed Chrome (PW_CHANNEL=chrome); CI installs Playwright's Chromium.
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1440, height: 900 },
    ...devices["Desktop Chrome"],
    ...(channel ? { channel } : {}),
  },
  webServer: {
    command: "pnpm exec vite preview --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
