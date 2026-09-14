# Frontend Workstream

**Owner:** Sara

Fill in `FrontendService` in `src/workstream.ts` and build against injected `FrontendServices`. `MockFrontendServices` supplies empty API data, while `FrontendService` initially returns an empty page and an inert HTTP response.

| Method | Expected behavior |
| --- | --- |
| `createServer(services)` | Create handlers for the four locked HTTP endpoints and serve the browser UI. |
| `renderPage()` | Return the responsive fake Teams application shell. |
| `listCards()` | Supply cards for `GET /api/cards`. |
| `nextCard()` | Supply a due card; the handler must hide its answer. |
| `getCard(id)` | Supply the complete card for answer reveal. |
| `submitReview(cardId, result)` | Submit a locked review result and return updated `ReviewState`. |

`FrontendServices` is an injected consumer port, not frontend-owned business logic. Do not access JSON storage or implement scheduling here.

## Demo Study Flow

The browser page uses `GET /api/cards` as an ordered deck and keeps navigation state in the browser. It shows one question with its source path and Git SHA, reveals the answer on demand, and resets the answer when moving between cards.

The baseline review endpoints and service methods remain available for future learning-engine integration, but the demo page does not submit review results or use due-card selection.
