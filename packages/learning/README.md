# Learning Workstream

**Owner:** Jenny

Fill in `LearningService` in `src/workstream.ts`. It currently supplies initial state, leaves reviews unchanged, and selects the first card, keeping integration usable while the algorithm is developed.

| Method | Expected behavior |
| --- | --- |
| `createReviewState(cardId)` | Return valid initial review metadata for a new card. |
| `scheduleReview(state, result, now?)` | Apply easy, hard, correct, or incorrect scoring and return the next immutable state. |
| `selectNextCard(cards, states, now?)` | Select the most appropriate due card, or `null` when none is due. |

Keep methods deterministic when `now` is supplied. Do not read repositories or know how cards were extracted.
