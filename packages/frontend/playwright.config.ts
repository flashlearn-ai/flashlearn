import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/browser",
  workers: 1,
  use: { browserName: "chromium", headless: true },
  webServer: [
    { command: "tsx test/fixtures/server.ts", url: "http://127.0.0.1:4175", reuseExistingServer: false },
    { command: "tsx test/fixtures/server.ts --demo", url: "http://127.0.0.1:4176/flashlearn/", reuseExistingServer: false },
  ],
});
