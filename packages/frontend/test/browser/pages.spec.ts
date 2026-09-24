import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";

const base = "http://127.0.0.1:4182/flashlearn/";

/* The sample demo is opt-in (`site:build -- --demo`), so it is absent from the
 * default build this suite usually runs against. Skipping keeps the check
 * meaningful when the demo ships instead of failing the site suite when it
 * deliberately does not. */
const demoBuilt = existsSync(new URL("../../../../.release/site/demo/index.html", import.meta.url));

test("hero and docs work at a repository subpath on desktop and mobile", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("everyday momentum");
    for (const stage of ["01 / SOURCE", "02 / GENERATE", "03 / LEARN"]) await expect(page.getByText(stage, { exact: true })).toBeVisible();
    await expect.poll(() => page.locator(".brand img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("link", { name: "Docs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Installation", exact: true })).toBeVisible();
    await expect(page.getByText(/Native Microsoft Teams, GitHub, and Slack delivery integrations are planned/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});

test("hero install command copies on desktop and mobile with keyboard access", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base);
    const button = page.getByRole("button", { name: "Copy install command" });
    await expect(button).toBeVisible();
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("status")).toContainText("Copied!");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npm i -g @flashlearnai/cli");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("clipboard failure leaves a selectable command and honest feedback", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("Denied"); } } });
  });
  await page.goto(base);
  await page.getByRole("button", { name: "Copy install command" }).click();
  await expect(page.getByRole("status")).toHaveText("Select and copy the install command above.");
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("npm i -g @flashlearnai/cli");
  await expect(page.getByRole("button", { name: "Copy install command" })).toBeEnabled();
});

test("install and quickstart stay usable without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto(base);
    await expect(page.locator("#install-command")).toHaveText("npm i -g @flashlearnai/cli");
    await expect(page.locator("#install-command")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copy install command" })).toBeHidden();
    await expect(page.locator(".quickstart")).toContainText("flashlearn generate");
    await page.getByRole("link", { name: "Docs", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Installation", exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("static demo completes a session without any API or external requests", async ({ page }) => {
  test.skip(!demoBuilt, "site was built without --demo, so there is no demo to check");
  await page.setViewportSize({ width: 390, height: 844 });
  const badRequests: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith(base) || request.url().includes("/api/")) badRequests.push(request.url());
  });
  await page.goto(base + "demo/");
  await expect(page.getByRole("note")).toContainText("Public sample demo");
  await expect.poll(() => page.locator("img").first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: /Get started/ }).click();
  await page.getByRole("button", { name: "Select all", exact: true }).click();
  await page.getByRole("button", { name: /Start ·/ }).click();
  // Public deck currently has 9 cards, dealt as a mix of multiple choice and
  // recall. Drive whichever the session dealt and exercise every rating path.
  for (let i = 0; i < 9; i++) {
    const choice = page.locator(".qchoice:not([disabled])").first();
    const reveal = page.getByRole("button", { name: "Reveal answer", exact: true }).first();
    // The transcript pauses on a typing indicator before the next card mounts.
    // Deciding which kind it is before then races that delay and picks wrong.
    await expect(choice.or(reveal)).toBeVisible();
    if (await choice.count()) {
      await choice.click();
      await page.getByRole("button", { name: /^(Easy|Continue)$/ }).first().click();
    } else {
      await reveal.click();
      await page.getByRole("button", { name: /^(Incorrect|Hard|Correct|Easy)$/ }).first().click();
    }
    await expect(page.getByText("Demo rating · session only", { exact: true })).toHaveCount(i + 1);
  }
  await expect(page.getByRole("button", { name: /Study more/ })).toBeVisible();
  expect(badRequests).toEqual([]);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: /Get started/ })).toBeVisible();
  await expect(page.getByText("Demo rating · session only", { exact: true })).toHaveCount(0);
});
