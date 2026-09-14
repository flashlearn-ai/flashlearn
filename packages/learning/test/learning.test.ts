import assert from "node:assert/strict";
import test from "node:test";
import { scheduleReview } from "../src/index.js";

test("an incorrect review is immediately due again", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const next = scheduleReview({ cardId: "1", easeFactor: 2.5, intervalDays: 5, reviewCount: 2, correctCount: 2 }, "incorrect", now);
  assert.equal(next.intervalDays, 0);
  assert.equal(next.nextReview, now.toISOString());
  assert.equal(next.correctCount, 2);
});
