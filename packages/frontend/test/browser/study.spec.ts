import { test, expect } from "@playwright/test";

test("live UI reveals, persists a rating, shows server schedule, and reaches an empty queue", async ({ page }) => {
  await page.goto("http://127.0.0.1:4175");
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("heading", { name: "Live API question?" })).toBeVisible();
  await expect(page.getByText("Live API answer.")).toHaveCount(0);
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await expect(page.getByText("Live API answer.")).toBeVisible();
  const submitted = page.waitForRequest((request) => request.url().endsWith("/api/review"));
  await page.getByRole("button", { name: "Correct", exact: true }).click();
  expect((await submitted).postDataJSON()).toEqual({ cardId: "live-test", result: "correct" });
  await expect(page.getByText(/Review saved.*2030/)).toBeVisible();
  await page.getByRole("button", { name: "Next card" }).click();
  await expect(page.getByRole("heading", { name: "No cards due" })).toBeVisible();
});

test("live UI keeps the card available after a failed review for retry", async ({ page }) => {
  await page.route("**/api/cards/next", (route) => route.fulfill({ json: { id: "retry", question: "Retry me?", source: { path: "test.ts", sha: "test" } } }));
  await page.route("**/api/cards/retry", (route) => route.fulfill({ json: { id: "retry", question: "Retry me?", answer: "Try again.", source: { path: "test.ts", sha: "test" } } }));
  await page.route("**/api/review", (route) => route.fulfill({ status: 500, json: { error: "Cannot save review" } }));
  await page.goto("http://127.0.0.1:4175");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Reveal answer" }).click();
  await page.getByRole("button", { name: "Hard", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Cannot save review");
  await expect(page.getByRole("button", { name: "Hard", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Next card" })).toHaveCount(0);
});

test("Pages demo works at a subpath on mobile without API calls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const apiCalls: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/api/")) apiCalls.push(request.url()); });
  await page.goto("http://127.0.0.1:4176/flashlearn/");
  await expect(page.getByText(/Web demo · sample data only/)).toBeVisible();
  await expect.poll(() => page.locator("img").first().evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Get started" }).click();
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Reveal answer" }).click();
    await page.getByRole("button", { name: "Easy", exact: true }).click();
    await expect(page.getByText("Demo rating recorded for this session only.")).toBeVisible();
    await page.getByRole("button", { name: "Next card" }).click();
  }
  await expect(page.getByRole("heading", { name: "Demo complete" })).toBeVisible();
  await page.getByRole("button", { name: "Restart demo" }).click();
  await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();
  expect(apiCalls).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("live empty deck explains how to generate cards", async ({ page }) => {
  await page.route("**/api/cards", (route) => route.fulfill({ json: [] }));
  await page.goto("http://127.0.0.1:4175");
  await expect(page.getByRole("heading", { name: "No cards yet" })).toBeVisible();
  await expect(page.getByText(/Run flashlearn generate/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reveal answer" })).toHaveCount(0);
});

test("live load failure offers retry rather than substituting sample data", async ({ page }) => {
  await page.route("**/api/cards", (route) => route.fulfill({ status: 500, json: { error: "Cannot load project" } }));
  await page.goto("http://127.0.0.1:4175");
  await expect(page.getByRole("alert")).toContainText("Cannot load project");
  await expect(page.getByRole("button", { name: "Get started" })).toHaveCount(0);
  await page.unroute("**/api/cards");
  await page.getByRole("button", { name: "Retry loading" }).click();
  await expect(page.getByRole("button", { name: "Get started" })).toBeVisible();
});
