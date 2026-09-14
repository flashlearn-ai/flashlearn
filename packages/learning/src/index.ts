import type { Card, ReviewResult, ReviewState } from "../../../contracts/index.js";
import { LearningService } from "./workstream.js";

export { LearningService } from "./workstream.js";
export type { LearningWorkstream } from "./workstream.js";

const learningService = new LearningService();

export function scheduleReview(state: ReviewState, result: ReviewResult, now = new Date()): ReviewState {
  return learningService.scheduleReview(state, result, now);
}

export function selectNextCard(cards: Card[], states: ReviewState[], now = new Date()): Card | null {
  return learningService.selectNextCard(cards, states, now);
}
