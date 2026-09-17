import { test, expect } from "@playwright/test";

const base = "http://127.0.0.1:4182/flashlearn/";

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

test("static demo completes a session without any API or external requests", async ({ page }) => {
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
  // Public deck currently has 9 cards. Choose any answer and exercise either rating path.
  for (let i = 0; i < 9; i++) {
    await page.locator(".qchoice:not([disabled])").first().click();
    const rating = page.getByRole("button", { name: /^(Easy|Continue)$/ }).first();
    await rating.click();
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
