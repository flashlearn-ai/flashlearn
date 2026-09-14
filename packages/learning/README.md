# Learning Workstream

**Owner:** Jenny

`LearningService` implements deterministic review scheduling and due-card selection behind the locked learning contracts. The package has no storage, extraction, CLI, or frontend dependencies, so development and tests use plain in-memory cards and review states while the other workstreams are in progress.

| Method | Expected behavior |
| --- | --- |
| `createReviewState(cardId)` | Return valid initial review metadata for a new card. |
| `scheduleReview(state, result, now?)` | Apply easy, hard, correct, or incorrect scoring and return the next immutable state. |
| `selectNextCard(cards, states, now?)` | Select the most appropriate due card, or `null` when none is due. |

Keep methods deterministic when `now` is supplied. Do not read repositories or know how cards were extracted.

## Baseline Scheduling Rules

| Result | Interval | Ease change | Counts as correct |
| --- | --- | --- | --- |
| `incorrect` | Due immediately | `-0.20` | No |
| `hard` | Previous interval multiplied by `1.2`, minimum one day | `-0.15` | Yes |
| `correct` | One day until the first successful recall, then multiplied by the current ease | None | Yes |
| `easy` | Four days until the first successful recall, then multiplied by the current ease plus `0.5` | `+0.15` | Yes |

Intervals are rounded to whole days and the ease factor never falls below `1.3`. `hard` counts as a successful recall because the learner remembered the answer with difficulty; `incorrect` does not.

Overdue reviewed cards are selected before unreviewed cards so the existing review queue does not grow stale. Reviewed cards are ordered by due timestamp, while unreviewed cards are ordered by creation time. An incorrect card is due immediately and may repeat when no older review is waiting. `selectNextCard` returns `null` when no card is due.

`createReviewState` defines the learning engine's initial-state contract for direct consumers and tests. The current production storage repository constructs the same defaults when no persisted state exists; changing those defaults requires coordinated storage and learning updates.

The free `scheduleReview` and `selectNextCard` exports used by the CLI delegate to `LearningService`, keeping one canonical implementation.
