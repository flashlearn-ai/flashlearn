import type { Card, ReviewResult, ReviewState } from "../../../contracts/index.js";

/** Scheduling and card-selection operations owned by the learning engine. */
export interface LearningWorkstream {
  createReviewState(cardId: string): ReviewState;
  scheduleReview(state: ReviewState, result: ReviewResult, now?: Date): ReviewState;
  selectNextCard(cards: Card[], states: ReviewState[], now?: Date): Card | null;
}

/** Jenny: fill in the scheduling rules while keeping these methods pure. */
export class LearningService implements LearningWorkstream {
  createReviewState(cardId: string): ReviewState {
    // TODO(Jenny): adjust defaults if the agreed algorithm requires it.
    return {
      cardId,
      easeFactor: 2.5,
      intervalDays: 0,
      reviewCount: 0,
      correctCount: 0,
    };
  }

  scheduleReview(state: ReviewState, _result: ReviewResult, _now?: Date): ReviewState {
    // TODO(Jenny): calculate and return updated review state.
    return state;
  }

  selectNextCard(cards: Card[], _states: ReviewState[], _now?: Date): Card | null {
    // TODO(Jenny): choose the earliest due card.
    return cards[0] ?? null;
  }
}
