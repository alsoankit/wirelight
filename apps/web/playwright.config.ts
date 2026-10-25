import { defineConfig, devices } from "@playwright/test";

// Browser tests of the production build (`pnpm build` first). Locally, use the installed Chrome
// (PW_CHANNEL=chrome); CI installs Playwright's Chromium. Without a GPU the game runs on the WebGL2
// backend (?backend=webgl2 isn't needed: it falls back by itself).
const channel = process.env.PW_CHANNEL;

export default defineConfig({
  testDir: "e2e",
  // Six minutes: CI has no GPU and draws in software (about two minutes on the simplest tier).
  timeout: 360_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:4173",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 900 },
    ...(channel ? { channel } : {}),
    // WebGPU on a machine with a GPU; on CI (no GPU) Chromium's software WebGL2 (the game falls back).
    launchOptions: process.env.CI
      ? {}
      : {
          args: ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist", "--use-angle=vulkan", "--enable-features=Vulkan"],
        },
  },
  webServer: {
    command: "pnpm exec vite preview --port 4173 --strictPort",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
