import assert from "node:assert/strict";
import test from "node:test";
import { createFlashLearnServer } from "../src/index.js";

test("next card response does not reveal the answer", async () => {
  const card = { id: "1", question: "Q", answer: "secret", source: { path: "a.ts", sha: "abc" }, createdAt: "now", updatedAt: "now" };
  const server = createFlashLearnServer({ listCards: async () => [card], nextCard: async () => card, getCard: async () => card, submitReview: async () => ({ cardId: "1", easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1 }) });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const response = await fetch(`http://127.0.0.1:${address.port}/api/cards/next`);
  assert.deepEqual(await response.json(), { id: "1", question: "Q", source: { path: "a.ts", sha: "abc" } });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
