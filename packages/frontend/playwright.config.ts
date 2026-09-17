import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  timeout: 60000,
  workers: 1,
  use: { browserName: "chromium", headless: true },
  webServer: {
    command: "node ../../scripts/preview-site.mjs",
    url: "http://127.0.0.1:4182/flashlearn/",
    reuseExistingServer: false,
  },
});
