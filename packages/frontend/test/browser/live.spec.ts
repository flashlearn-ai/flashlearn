import { test, expect } from "@playwright/test";
import type { Card, ReviewState } from "../../../../contracts/index.js";
import { createFlashLearnServer, type FrontendServices } from "../../src/index.js";
import { REVIEW_HISTORY_KEY } from "../../client/src/lib/insights.js";

function card(id: string): Card {
  return { id, question: `Recall ${id}?`, answer: `The revealed answer for ${id}.`, source: { path: `test/${id}.ts`, sha: "abc1234" }, tags: ["test"], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
}

async function serve(services: FrontendServices) {
  const server = createFlashLearnServer(services);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Server did not bind");
  return { origin: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}

test("live selection, save failures and confirmed schedules/insights survive reload", async ({ page }) => {
  // Package-local service fixture: server-owned state survives browser reloads.
  // Dates are scripted responses, not a duplicate of the learning algorithm.
  const cards = [card("future"), card("due-one"), card("due-two")];
  const saved = new Map<string, ReviewState>();
  saved.set("future", { cardId: "future", easeFactor: 2.5, intervalDays: 10, reviewCount: 1, correctCount: 1, nextReview: "2099-01-01T00:00:00Z" });
  let nextCalls = 0;
  let revealFailure = true;
  let failNext = true;
  let saveCalls = 0;
  let rejectSave: (() => void) | undefined;
  const services: FrontendServices = {
    listCards: async () => cards,
    nextCard: async () => {
      nextCalls += 1;
      if (failNext) { failNext = false; throw new Error("Selection unavailable"); }
      return cards.find((entry) => (saved.get(entry.id)?.nextReview ?? "2000-01-01") < new Date().toISOString()) ?? null;
    },
    getCard: async (id) => {
      if (revealFailure) { revealFailure = false; throw new Error("Reveal unavailable"); }
      return cards.find((entry) => entry.id === id) ?? null;
    },
    submitReview: async (cardId, result) => {
      saveCalls += 1;
      if (saveCalls === 1) await new Promise<void>((_, reject) => { rejectSave = () => reject(new Error("Save unavailable")); });
      const state: ReviewState = { cardId, easeFactor: 2.5, intervalDays: result === "incorrect" ? 0 : 10,
        reviewCount: (saved.get(cardId)?.reviewCount ?? 0) + 1, correctCount: result === "incorrect" ? 0 : 1,
        nextReview: result === "incorrect" ? "2000-01-01T00:00:00Z" : "2099-01-01T00:00:00Z" };
      saved.set(cardId, state);
      return state;
    },
  };
  const server = await serve(services);
  const errors: string[] = [];
  const history = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), REVIEW_HISTORY_KEY);
  const mobileInsights = page.locator(".live-insights");
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.origin);
    await mobileInsights.locator("summary").click();
    await expect(mobileInsights.getByText("No review history yet.")).toBeVisible();
    await expect(page.getByText("Choose topics", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Start due review" }).click();
    await expect(page.getByRole("alert")).toContainText("Could not load the next card");
    await page.getByRole("button", { name: "Retry due cards" }).click();
    await expect(page.getByText("Recall due-one?", { exact: true })).toBeVisible();
    await expect(page.getByText("Recall future?", { exact: true })).toHaveCount(0);
    await expect(page.getByText(cards[1]!.answer, { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Reveal answer" }).click();
    await expect(page.getByRole("alert")).toContainText("Could not reveal");
    await expect(page.getByRole("button", { name: "Easy", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Retry reveal" }).click();
    await expect(page.getByText(cards[1]!.answer, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Easy", exact: true }).dblclick();
    await expect(page.getByText("Saving review…", { exact: true })).toBeVisible();
    await expect.poll(() => saveCalls).toBe(1);
    await expect(page.getByText(/Scheduled ·/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Next due card|Check for due cards/ })).toHaveCount(0);
    expect(nextCalls).toBe(2);
    expect(saved.has("due-one")).toBe(false);
    expect(await history()).toEqual([]);
    rejectSave!();
    await expect(page.getByRole("alert")).toContainText("Save not confirmed");
    expect(await history()).toEqual([]);
    await expect(mobileInsights.getByText("No review history yet.")).toBeVisible();

    // Even a 200 response must be a valid acknowledgement before logging history.
    await page.route("**/api/review", (route) => route.fulfill({ json: { cardId: "due-one" } }), { times: 1 });
    await page.getByRole("button", { name: "Retry save" }).click();
    await expect(page.getByRole("alert")).toContainText("Save not confirmed");
    expect(await history()).toEqual([]);
    await expect(page.getByRole("button", { name: "Next due card" })).toHaveCount(0);
    await page.getByRole("button", { name: "Retry save" }).click();
    await expect(page.getByText(/Scheduled ·/)).toHaveCount(1);
    await expect(mobileInsights.locator(".insight")).toHaveCount(1);
    await expect(mobileInsights.locator(".insight")).toContainText("Test");
    await expect(mobileInsights.locator(".insight")).toContainText("100%");
    await expect(mobileInsights.locator(".insight")).toContainText("1 attempt · 1 easy · 0 difficult");
    const confirmedHistory = await history();
    expect(confirmedHistory).toEqual([expect.objectContaining({ cardId: "due-one", topicId: "test", topicLabel: "Test", result: "easy", reviewedAt: expect.any(String) })]);
    expect(saved.get("due-one")?.nextReview).toBe("2099-01-01T00:00:00Z");
    expect(saveCalls).toBe(2);

    // Browser reload must use server state, not a fresh session from /api/cards.
    await page.reload();
    await mobileInsights.locator("summary").click();
    await expect(mobileInsights.locator(".insight")).toContainText("1 attempt · 1 easy · 0 difficult");
    expect(await history()).toEqual(confirmedHistory);
    await page.getByRole("button", { name: "Start due review" }).click();
    await expect(page.getByText("Recall due-two?", { exact: true })).toBeVisible();
    await expect(page.getByText("Recall due-one?", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Reveal answer" }).click();
    await page.getByRole("button", { name: "Incorrect", exact: true }).click();
    await expect(page.getByText("Scheduled · comes back today", { exact: true })).toBeVisible();
    await expect(mobileInsights.locator(".insight")).toContainText("50%");
    await expect(mobileInsights.locator(".insight")).toContainText("2 attempts · 1 easy · 1 difficult");
    await page.getByRole("button", { name: "Next due card" }).click();
    await expect(page.getByText("Recall due-two?", { exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "Reveal answer" }).click();
    await page.getByRole("button", { name: "Correct", exact: true }).click();
    await page.getByRole("button", { name: "Next due card" }).click();
    await expect(page.getByText(/No cards are due right now/)).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Start due review" }).click();
    await expect(page.getByText(/No cards are due right now/)).toBeVisible();
    await expect(page.locator(".qcard")).toHaveCount(0);
    expect(await history()).toEqual([
      ...confirmedHistory,
      expect.objectContaining({ cardId: "due-two", result: "incorrect" }),
      expect.objectContaining({ cardId: "due-two", result: "correct" }),
    ]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator(".details .insight")).toBeVisible();
    await expect(page.locator(".details .insight")).toContainText("67%");
    await expect(page.locator(".details .insight")).toContainText("3 attempts · 1 easy · 1 difficult");
    expect(saved.get("due-two")?.reviewCount).toBe(2);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { rejectSave?.(); await server.close(); }
});

test("immediately due repeats stay bounded and a new session cannot start during the last save", async ({ page }) => {
  const only = card("repeat");
  let saveCalls = 0;
  let finish: (() => void) | undefined;
  const server = await serve({
    listCards: async () => [only], nextCard: async () => only, getCard: async () => only,
    submitReview: async (cardId) => {
      saveCalls += 1;
      if (saveCalls === 12) await new Promise<void>((resolve) => { finish = resolve; });
      return { cardId, easeFactor: 2.5, intervalDays: 0, reviewCount: saveCalls, correctCount: 0, nextReview: "2000-01-01T00:00:00Z" };
    },
  });
  try {
    await page.goto(server.origin);
    await page.getByRole("button", { name: "Start due review" }).click();
    for (let i = 0; i < 12; i += 1) {
      await page.getByRole("button", { name: "Reveal answer" }).click();
      await page.getByRole("button", { name: "Incorrect", exact: true }).click();
      if (i < 11) await page.getByRole("button", { name: "Next due card" }).click();
    }
    await expect(page.getByText("Saving review…", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Next due card|Check for due cards/ })).toHaveCount(0);
    await expect.poll(() => saveCalls).toBe(12);
    finish!();
    await expect(page.getByText("Session complete · 12 reviews saved.")).toBeVisible();
    await expect(page.locator(".qcard")).toHaveCount(12);
    await page.getByRole("button", { name: "Check for due cards" }).click();
    await expect(page.locator(".qcard")).toHaveCount(1);
    expect(saveCalls).toBe(12);
  } finally { finish?.(); await server.close(); }
});
