import type { Card, ReviewResult, ReviewState } from "../../../contracts/index.js";

const MINIMUM_EASE_FACTOR = 1.3;
const INITIAL_EASE_FACTOR = 2.5;

/** Scheduling and card-selection operations owned by the learning engine. */
export interface LearningWorkstream {
  createReviewState(cardId: string): ReviewState;
  scheduleReview(state: ReviewState, result: ReviewResult, now?: Date): ReviewState;
  selectNextCard(cards: Card[], states: ReviewState[], now?: Date): Card | null;
}

/** Deterministic spaced-repetition rules with no storage or extraction dependencies. */
export class LearningService implements LearningWorkstream {
  createReviewState(cardId: string): ReviewState {
    return {
      cardId,
      easeFactor: INITIAL_EASE_FACTOR,
      intervalDays: 0,
      reviewCount: 0,
      correctCount: 0,
    };
  }

  scheduleReview(state: ReviewState, result: ReviewResult, now = new Date()): ReviewState {
    const successful = result !== "incorrect";
    const multipliers: Record<ReviewResult, number> = {
      incorrect: 0,
      hard: 1.2,
      correct: state.reviewCount === 0 ? 1 : state.easeFactor,
      easy: state.reviewCount === 0 ? 4 : state.easeFactor + 0.5,
    };
    const intervalDays = successful
      ? Math.max(1, Math.round(Math.max(1, state.intervalDays) * multipliers[result]))
      : 0;
    const easeDelta = result === "easy"
      ? 0.15
      : result === "hard"
        ? -0.15
        : result === "incorrect"
          ? -0.2
          : 0;
    const nextReview = new Date(now);
    nextReview.setUTCDate(nextReview.getUTCDate() + intervalDays);

    return {
      ...state,
      easeFactor: Math.max(MINIMUM_EASE_FACTOR, state.easeFactor + easeDelta),
      intervalDays,
      lastReviewed: now.toISOString(),
      nextReview: nextReview.toISOString(),
      reviewCount: state.reviewCount + 1,
      correctCount: state.correctCount + (successful ? 1 : 0),
    };
  }

  selectNextCard(cards: Card[], states: ReviewState[], now = new Date()): Card | null {
    const byCard = new Map(states.map((state) => [state.cardId, state]));

    return cards
      .filter((card) => {
        const nextReview = byCard.get(card.id)?.nextReview;
        return !nextReview || new Date(nextReview) <= now;
      })
      .sort((left, right) => {
        const leftDue = byCard.get(left.id)?.nextReview ?? "";
        const rightDue = byCard.get(right.id)?.nextReview ?? "";
        return leftDue.localeCompare(rightDue) || left.createdAt.localeCompare(right.createdAt);
      })[0] ?? null;
  }
}
