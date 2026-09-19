import { test, expect, type Page } from "@playwright/test";
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

/** Chooses the schedule route, then starts a due session. */
async function studyDue(page: Page) {
  const enter = page.getByRole("button", { name: "Study what’s due", exact: true });
  const start = page.getByRole("button", { name: "Start due review" });
  // The start screen only renders once the deck has loaded. Deciding before
  // then races that fetch and skips the route choice.
  await expect(enter.or(start)).toBeVisible();
  if (await enter.count()) await enter.click();
  await start.click();
}

test("live selection, save failures and confirmed schedules/insights survive reload", async ({ page }) => {
  // Package-local service fixture: server-owned state survives browser reloads.
  // Dates are scripted responses, not a duplicate of the learning algorithm.
  const cards = [card("future"), card("due-one"), card("due-two")];
  const saved = new Map<string, ReviewState>();
  saved.set("future", { cardId: "future", easeFactor: 2.5, intervalDays: 10, reviewCount: 1, correctCount: 1, nextReview: "2099-01-01T00:00:00Z" });
  let nextCalls = 0;
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
    // Both ways in are offered. Topic sessions are dealt client-side and are
    // early reviews, so they must never be presented as the due queue.
    await expect(page.getByRole("button", { name: "Choose topics", exact: true })).toBeVisible();
    await studyDue(page);
    await expect(page.getByRole("alert")).toContainText("Could not load the next card");
    await page.getByRole("button", { name: "Retry due cards" }).click();
    await expect(page.getByText("Recall due-one?", { exact: true })).toBeVisible();
    await expect(page.getByText("Recall future?", { exact: true })).toHaveCount(0);
    // The first due card is dealt as multiple choice, so its answer is one of
    // the options rather than hidden behind a reveal. Nothing may be gradeable
    // until an option is picked.
    await expect(page.locator(".qchoice")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Easy", exact: true })).toHaveCount(0);
    await page.locator(".qchoice").filter({ hasText: cards[1]!.answer }).click();
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
    await studyDue(page);
    await expect(page.getByText("Recall due-two?", { exact: true })).toBeVisible();
    await expect(page.getByText("Recall due-one?", { exact: true })).toHaveCount(0);
    // A fresh transcript deals its first card as multiple choice. Picking a
    // wrong option grades it incorrect, which is due again immediately.
    await page.locator(".qchoice").filter({ hasNotText: cards[2]!.answer }).first().click();
    await page.getByRole("button", { name: "Continue" }).click();
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
    await studyDue(page);
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
    await studyDue(page);
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


/* The schedule chooses which card is due; it does not choose how it is asked.
 * A due card must be dealt through the same presentation as any other, so the
 * live route offers multiple choice as well as recall. */
test("a due card can be asked as multiple choice, not only recall", async ({ page }) => {
  const deck = ["alpha", "beta", "gamma", "delta"].map(card);
  let served = 0;
  const server = await serve({
    listCards: async () => deck,
    nextCard: async () => deck[Math.min(served++, deck.length - 1)]!,
    getCard: async (id) => deck.find((entry) => entry.id === id) ?? null,
    submitReview: async (cardId) => ({ cardId, easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1, nextReview: "2030-01-01T00:00:00Z" }),
  });
  try {
    await page.goto(server.origin);
    await studyDue(page);
    await expect(page.locator(".qchoice").first()).toBeVisible();
    await expect(page.locator(".qchoice")).toHaveCount(3);
    // Exactly one option is this card's own answer; the others come from the deck.
    await expect(page.getByText("The revealed answer for alpha.", { exact: true })).toHaveCount(1);
    // Choosing grades and saves through the same path recall uses.
    await page.locator(".qchoice").filter({ hasText: "The revealed answer for alpha." }).click();
    await page.getByRole("button", { name: /^(Easy|Continue)$/ }).first().click();
    await expect(page.getByRole("button", { name: "Next due card" })).toBeVisible();
  } finally { await server.close(); }
});

/* A card generated after the deck loaded is not in it, so its answer is fetched.
 * That request is the one remaining use of `GET /api/cards/:id`, and it has to
 * fail into the same retry the next-card request uses. */
test("a due card missing from the loaded deck is fetched, and a failed fetch can be retried", async ({ page }) => {
  const loaded = card("loaded");
  const fresh = card("generated-later");
  let fetches = 0;
  const server = await serve({
    listCards: async () => [loaded],
    nextCard: async () => fresh,
    getCard: async (id) => {
      if (id !== fresh.id) return loaded;
      if (++fetches === 1) throw new Error("Card unavailable");
      return fresh;
    },
    submitReview: async (cardId) => ({ cardId, easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1, nextReview: "2030-01-01T00:00:00Z" }),
  });
  try {
    await page.goto(server.origin);
    await studyDue(page);
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Retry due cards" }).click();
    await expect(page.getByText("Recall generated-later?", { exact: true })).toBeVisible();
    expect(fetches).toBe(2);
  } finally { await server.close(); }
});

/* Variety is the default, but a learner who wants only recall should get only
 * recall, on both ways in. Forcing it must survive into the dealt session. */
test("choosing recall before starting deals no multiple choice", async ({ page }) => {
  const deck = ["one", "two", "three", "four"].map(card);
  let served = 0;
  const server = await serve({
    listCards: async () => deck,
    nextCard: async () => deck[Math.min(served++, deck.length - 1)]!,
    getCard: async (id) => deck.find((entry) => entry.id === id) ?? null,
    submitReview: async (cardId) => ({ cardId, easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1, nextReview: "2030-01-01T00:00:00Z" }),
  });
  try {
    await page.goto(server.origin);
    // The choice sits with the session it starts, not on the screen before it.
    await page.getByRole("button", { name: "Study what’s due", exact: true }).click();
    await page.getByRole("button", { name: "Recall only", exact: true }).click();
    await page.getByRole("button", { name: "Start due review" }).click();
    await expect(page.getByRole("button", { name: "Reveal answer" })).toBeVisible();
    await expect(page.locator(".qchoice")).toHaveCount(0);
  } finally { await server.close(); }
});

/* Only the sample deck ships excerpts, so a live card has nothing to expand.
 * Rendering its attribution as a disclosure control invites a click that does
 * nothing; the live route showed it as plain text before cards were shared. */
test("a live card's attribution is not an expandable control", async ({ page }) => {
  const deck = ["one", "two", "three"].map(card);
  let served = 0;
  const server = await serve({
    listCards: async () => deck,
    nextCard: async () => deck[Math.min(served++, deck.length - 1)]!,
    getCard: async (id) => deck.find((entry) => entry.id === id) ?? null,
    submitReview: async (cardId) => ({ cardId, easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1, nextReview: "2030-01-01T00:00:00Z" }),
  });
  try {
    await page.goto(server.origin);
    await studyDue(page);
    await expect(page.locator(".qsrc")).toContainText("test/one.ts");
    await expect(page.locator("button.qsrc")).toHaveCount(0);
  } finally { await server.close(); }
});

/* The chooser is where a learner decides what to study, and the deck it draws
 * from is the repository. With more than one project that name is the only way
 * to tell the decks apart, and the details pane holding it is hidden on mobile. */
test("the topic chooser names the project the deck came from", async ({ page }) => {
  const deck = ["alpha", "beta"].map(card);
  const server = await serve({
    listCards: async () => deck,
    nextCard: async () => deck[0]!,
    getCard: async (id) => deck.find((entry) => entry.id === id) ?? null,
    submitReview: async (cardId) => ({ cardId, easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1, nextReview: "2030-01-01T00:00:00Z" }),
    project: async () => ({ name: "kubernetes" }),
  });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.origin);
    await page.getByRole("button", { name: "Choose topics", exact: true }).click();
    await expect(page.locator(".pick-head")).toContainText("kubernetes");
  } finally { await server.close(); }
});

/* The mode buttons belong to the card that starts the session. Floating them
 * above it made two unrelated-looking elements of different widths. */
test("the mode selector belongs to the card that starts the session", async ({ page }) => {
  const deck = ["alpha", "beta"].map(card);
  const server = await serve({
    listCards: async () => deck,
    nextCard: async () => deck[0]!,
    getCard: async (id) => deck.find((entry) => entry.id === id) ?? null,
    submitReview: async (cardId) => ({ cardId, easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1, nextReview: "2030-01-01T00:00:00Z" }),
  });
  try {
    await page.goto(server.origin);
    await page.getByRole("button", { name: "Choose topics", exact: true }).click();
    await expect(page.locator(".pick .modes")).toBeVisible();
    await expect(page.locator(".modes")).toHaveCount(1);
    const modes = (await page.locator(".modes").boundingBox())!;
    const pick = (await page.locator(".pick").boundingBox())!;
    expect(Math.round(modes.width)).toBeLessThanOrEqual(Math.round(pick.width));
  } finally { await server.close(); }
});


/* Three peer options must read as peers. Wrapping two onto one row and the
 * third onto its own makes one look like a different kind of control. */
test("the mode options are laid out evenly on a phone", async ({ page }) => {
  const deck = ["alpha", "beta"].map(card);
  const server = await serve({
    listCards: async () => deck,
    nextCard: async () => deck[0]!,
    getCard: async (id) => deck.find((entry) => entry.id === id) ?? null,
    submitReview: async (cardId) => ({ cardId, easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1, nextReview: "2030-01-01T00:00:00Z" }),
  });
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.origin);
    await page.getByRole("button", { name: "Choose topics", exact: true }).click();
    await page.locator(".pick .modes").waitFor();
    const boxes = await page.locator(".modes .start").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; }));
    expect(boxes).toHaveLength(3);
    const widths = new Set(boxes.map((b) => b.w));
    const heights = new Set(boxes.map((b) => b.h));
    expect(widths.size, `options have mismatched widths: ${boxes.map((b) => b.w).join(", ")}`).toBe(1);
    expect(heights.size, `options have mismatched heights: ${boxes.map((b) => b.h).join(", ")}`).toBe(1);
  } finally { await server.close(); }
});

/* Recall cards record no chosen option, so anything reading `.answer` directly
 * treats a finished recall run as untouched: blank progress bars beside a score
 * that counted it. Every view must score through the shared predicates. */
test("a rated recall card marks its progress bar", async ({ page }) => {
  const deck = ["alpha", "beta"].map(card);
  const server = await serve({
    listCards: async () => deck,
    nextCard: async () => deck[0]!,
    getCard: async (id) => deck.find((entry) => entry.id === id) ?? null,
    submitReview: async (cardId) => ({ cardId, easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1, nextReview: "2030-01-01T00:00:00Z" }),
  });
  try {
    await page.setViewportSize({ width: 1280, height: 950 });
    await page.goto(server.origin);
    await page.getByRole("button", { name: "Choose topics", exact: true }).click();
    await page.getByRole("button", { name: "Recall only", exact: true }).click();
    await page.getByRole("button", { name: "Select all", exact: true }).click();
    await page.getByRole("button", { name: /Start ·/ }).click();
    await page.getByRole("button", { name: "Reveal answer" }).first().click();
    await page.getByRole("button", { name: "Easy", exact: true }).first().click();
    await expect(page.locator(".bars i.ok")).toHaveCount(1);
  } finally { await server.close(); }
});

/* Picking a route must not be a one-way door. A learner who finishes the due
 * queue, or simply changes their mind, needs a way back without a reload. */
test("a learner can return from the due route to choose topics", async ({ page }) => {
  const deck = ["alpha", "beta"].map(card);
  const server = await serve({
    listCards: async () => deck,
    nextCard: async () => null,
    getCard: async (id) => deck.find((entry) => entry.id === id) ?? null,
    submitReview: async (cardId) => ({ cardId, easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1, nextReview: "2030-01-01T00:00:00Z" }),
  });
  try {
    await page.goto(server.origin);
    await studyDue(page);
    await expect(page.getByText(/No cards are due right now/)).toBeVisible();
    await page.getByRole("button", { name: "Choose topics", exact: true }).click();
    await expect(page.getByRole("button", { name: "Select all", exact: true })).toBeVisible();
  } finally { await server.close(); }
});
