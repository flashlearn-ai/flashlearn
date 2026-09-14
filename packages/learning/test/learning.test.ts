import assert from "node:assert/strict";
import test from "node:test";
import type { Card, ReviewResult, ReviewState } from "../../../contracts/index.js";
import { LearningService, scheduleReview, selectNextCard } from "../src/index.js";

const now = new Date("2026-01-01T00:00:00.000Z");
const service = new LearningService();

function reviewState(overrides: Partial<ReviewState> = {}): ReviewState {
  return {
    cardId: "1",
    easeFactor: 2.5,
    intervalDays: 5,
    reviewCount: 2,
    correctCount: 2,
    ...overrides,
  };
}

function card(id: string, createdAt: string): Card {
  return {
    id,
    question: `Question ${id}`,
    answer: `Answer ${id}`,
    source: { path: `${id}.md`, sha: `sha-${id}` },
    createdAt,
    updatedAt: createdAt,
  };
}

test("creates initial review state without needing storage", () => {
  assert.deepEqual(service.createReviewState("card-1"), {
    cardId: "card-1",
    easeFactor: 2.5,
    intervalDays: 0,
    reviewCount: 0,
    correctCount: 0,
  });
});

test("an incorrect review is immediately due again", () => {
  assert.deepEqual(scheduleReview(reviewState(), "incorrect", now), {
    cardId: "1",
    easeFactor: 2.3,
    intervalDays: 0,
    lastReviewed: now.toISOString(),
    nextReview: now.toISOString(),
    reviewCount: 3,
    correctCount: 2,
  });
});

test("applies hard, correct, and easy interval and ease rules", () => {
  const expected: Record<Exclude<ReviewResult, "incorrect">, {
    intervalDays: number;
    easeFactor: number;
  }> = {
    hard: { intervalDays: 6, easeFactor: 2.35 },
    correct: { intervalDays: 13, easeFactor: 2.5 },
    easy: { intervalDays: 15, easeFactor: 2.65 },
  };

  for (const result of ["hard", "correct", "easy"] as const) {
    const next = scheduleReview(reviewState(), result, now);
    assert.equal(next.intervalDays, expected[result].intervalDays);
    assert.equal(next.easeFactor, expected[result].easeFactor);
    assert.equal(next.nextReview, new Date(
      Date.UTC(2026, 0, 1 + expected[result].intervalDays),
    ).toISOString());
    assert.equal(next.reviewCount, 3);
    assert.equal(next.correctCount, 3);
  }
});

test("uses short fixed intervals for a card's first successful review", () => {
  const initial = service.createReviewState("1");

  assert.equal(scheduleReview(initial, "hard", now).intervalDays, 1);
  assert.equal(scheduleReview(initial, "correct", now).intervalDays, 1);
  assert.equal(scheduleReview(initial, "easy", now).intervalDays, 4);
});

test("does not mutate input state and never lowers ease below the minimum", () => {
  const state = reviewState({ easeFactor: 1.3 });
  const snapshot = structuredClone(state);
  const next = scheduleReview(state, "incorrect", now);

  assert.deepEqual(state, snapshot);
  assert.notStrictEqual(next, state);
  assert.equal(next.easeFactor, 1.3);
});

test("selects unreviewed cards in creation order", () => {
  const newer = card("newer", "2026-01-02T00:00:00.000Z");
  const older = card("older", "2026-01-01T00:00:00.000Z");

  assert.equal(selectNextCard([newer, older], [], now)?.id, "older");
});

test("selects the earliest reviewed card that is due", () => {
  const cards = [
    card("later", "2025-01-01T00:00:00.000Z"),
    card("earlier", "2025-01-02T00:00:00.000Z"),
    card("future", "2025-01-03T00:00:00.000Z"),
  ];
  const states = [
    reviewState({ cardId: "later", nextReview: "2025-12-31T12:00:00.000Z" }),
    reviewState({ cardId: "earlier", nextReview: "2025-12-30T12:00:00.000Z" }),
    reviewState({ cardId: "future", nextReview: "2026-01-02T00:00:00.000Z" }),
  ];

  assert.equal(selectNextCard(cards, states, now)?.id, "earlier");
});

test("returns null when every card is scheduled for the future", () => {
  const cards = [card("1", "2025-01-01T00:00:00.000Z")];
  const states = [reviewState({
    cardId: "1",
    nextReview: "2026-01-02T00:00:00.000Z",
  })];

  assert.equal(selectNextCard(cards, states, now), null);
});

test("production exports use the same implementation as LearningService", () => {
  const state = reviewState();
  const cards = [card("1", "2025-01-01T00:00:00.000Z")];

  assert.deepEqual(
    scheduleReview(state, "easy", now),
    service.scheduleReview(state, "easy", now),
  );
  assert.deepEqual(
    selectNextCard(cards, [], now),
    service.selectNextCard(cards, [], now),
  );
});
