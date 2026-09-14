import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { JsonCardRepository, JsonReviewRepository } from "../src/index.js";

test("persists cards and supplies new review state", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flashlearn-storage-"));
  const cards = new JsonCardRepository(join(directory, "cards.json"));
  const reviews = new JsonReviewRepository(join(directory, "review.json"));
  await cards.save({ id: "1", question: "Q", answer: "A", source: { path: "a.ts", sha: "abc" }, createdAt: "now", updatedAt: "now" });
  assert.equal((await cards.get("1"))?.answer, "A");
  assert.deepEqual(await reviews.get("1"), { cardId: "1", easeFactor: 2.5, intervalDays: 0, reviewCount: 0, correctCount: 0 });
});
