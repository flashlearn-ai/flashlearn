import assert from "node:assert/strict";
import test from "node:test";
import {
  REVIEW_HISTORY_KEY,
  buildTopicInsights,
  loadReviewEvents,
  recordReviewEvent,
  type ReviewEvent,
} from "../client/src/lib/insights.js";

function memoryStore(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
}

test("records a topic snapshot with the successful review grade", () => {
  const store = memoryStore();
  const events = recordReviewEvent(
    "card-1",
    { id: "storage", label: "Storage" },
    "hard",
    store,
    new Date("2026-09-18T12:00:00.000Z"),
  );

  assert.deepEqual(events, [{
    cardId: "card-1",
    topicId: "storage",
    topicLabel: "Storage",
    result: "hard",
    reviewedAt: "2026-09-18T12:00:00.000Z",
  }]);
  assert.deepEqual(loadReviewEvents(store), events);
  assert.equal(REVIEW_HISTORY_KEY, "flashlearn.review-history.v1");
});

test("ignores malformed local history instead of breaking the client", () => {
  const mixed = JSON.stringify([
    { cardId: "valid", topicId: "cli", topicLabel: "CLI", result: "easy", reviewedAt: "2026-09-18T12:00:00.000Z" },
    { cardId: "invalid", result: "maybe" },
  ]);
  assert.deepEqual(loadReviewEvents(memoryStore(mixed)).map((event) => event.cardId), ["valid"]);
  assert.deepEqual(loadReviewEvents(memoryStore("not json")), []);
});

test("orders topic insights hardest first and preserves grade detail", () => {
  const events: ReviewEvent[] = [
    { cardId: "1", topicId: "cli", topicLabel: "CLI", result: "easy", reviewedAt: "2026-09-18T10:00:00.000Z" },
    { cardId: "2", topicId: "cli", topicLabel: "CLI", result: "correct", reviewedAt: "2026-09-18T11:00:00.000Z" },
    { cardId: "3", topicId: "storage", topicLabel: "Storage", result: "hard", reviewedAt: "2026-09-18T12:00:00.000Z" },
    { cardId: "4", topicId: "storage", topicLabel: "Storage", result: "incorrect", reviewedAt: "2026-09-18T13:00:00.000Z" },
  ];

  assert.deepEqual(buildTopicInsights(events), [
    { id: "storage", label: "Storage", attempts: 2, successful: 1, easy: 0, hard: 1, incorrect: 1, successRate: 50 },
    { id: "cli", label: "CLI", attempts: 2, successful: 2, easy: 1, hard: 0, incorrect: 0, successRate: 100 },
  ]);
});