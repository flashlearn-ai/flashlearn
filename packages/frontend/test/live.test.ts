import assert from "node:assert/strict";
import test from "node:test";
import { nextCard, revealCard } from "../client/src/lib/live.js";
import { submitReview } from "../client/src/lib/review.js";

const card = { id: "id/with space", question: "Question?", answer: "Answer.", source: { path: "src/test.ts", sha: "abc1234" }, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };

test("next uses the due endpoint without caching and keeps only preview fields", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "/api/cards/next");
    assert.equal(options.cache, "no-store");
    return Response.json(card);
  });
  assert.deepEqual(await nextCard(), { id: card.id, question: card.question, source: card.source });
});

test("empty due queue differs from transport and malformed-data failures", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  assert.equal(await nextCard(), null);
  mock.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await assert.rejects(nextCard, /503/);
  mock.mock.mockImplementation(async () => Response.json({ ...card, source: { path: "src/test.ts", sha: 123 } }));
  await assert.rejects(nextCard, /invalid card preview/);
});

test("reveal encodes IDs and rejects mismatched or malformed cards", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(url, "/api/cards/id%2Fwith%20space");
    return Response.json(card);
  });
  assert.deepEqual(await revealCard(card.id), card);
  for (const payload of [{ ...card, id: "other" }, { ...card, tags: [3] }]) {
    mock.mock.mockImplementation(async () => Response.json(payload));
    await assert.rejects(() => revealCard(card.id), /invalid answer card/);
  }
});

test("only validated review acknowledgements claim persistence and server dates", async (t) => {
  const state = { cardId: card.id, easeFactor: 2.5, intervalDays: 10, reviewCount: 1, correctCount: 1, nextReview: "2099-01-01T00:00:00Z" };
  const mock = t.mock.method(globalThis, "fetch", async (_url, options) => {
    assert.deepEqual(JSON.parse(options.body), { cardId: card.id, result: "easy" });
    return Response.json(state);
  });
  assert.deepEqual(await submitReview(card.id, "easy"), { recorded: true, due: state.nextReview });
  for (const payload of [null, {}, { ...state, cardId: "other" }, { ...state, nextReview: "bad" }, { ...state, reviewCount: "1" }]) {
    mock.mock.mockImplementation(async () => Response.json(payload));
    assert.deepEqual(await submitReview(card.id, "easy"), { recorded: false, due: null });
  }
  mock.mock.mockImplementation(async () => { throw new Error("Network unavailable"); });
  assert.deepEqual(await submitReview(card.id, "easy"), { recorded: false, due: null });
});
