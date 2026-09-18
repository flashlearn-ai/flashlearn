# Frontend Workstream

**Owner:** Sara

Multiple-choice options hide leading documented symbol names and sample distractors across the deck. Original card answers and source attribution remain intact; the session's confusion lookup uses the same normalization as the displayed choices.

Two halves in one package. `src/` is the Node server that answers the four locked HTTP endpoints and serves the built client. `client/` is the browser client, a Vite and React tree with its own tsconfig, because the server compiles to `NodeNext` and emits while the client resolves through a bundler and does not.

`createFlashLearnServer(services)` is what the CLI composes; `FrontendServices` is an injected consumer port, not frontend-owned business logic. Do not access JSON storage or implement scheduling here. `MockFrontendServices` supplies empty API data for building against.

The live build uses `client/dist`; `npm run demo --workspace @flashlearn/frontend` writes `client/dist-demo` and never overwrites the live build. Demo assets use relative paths and ratings are session-only, without API calls. Official builds override local `VITE_DECK_SOURCE` settings so release artifacts cannot accidentally load a private deck URL.

Root `site:build` combines the demo with the landing page and tool docs from `site/`. Run `site:preview` for a subpath-aware preview and `site:test` for browser checks. See `docs/release-readiness.md` at the repo root for release and Pages setup.

| Method | Behaviour |
| --- | --- |
| `createServer(services)` | Handle the four locked endpoints, then serve `client/dist` for any other GET, falling back to the client shell so the browser owns routing. |
| `renderPage()` | Return the built client shell, or build instructions when `client/dist` is absent. |
| `listCards()` | Supply cards for `GET /api/cards`. |
| `nextCard()` | Supply a due card; the handler must hide its answer. |
| `getCard(id)` | Supply the complete card for answer reveal. |
| `submitReview(cardId, result)` | Submit a locked review result and return updated `ReviewState`. |

## Commands

```bash
npm run build --workspace @flashlearn/frontend   # server, then the client into client/dist
npm run dev --workspace @flashlearn/frontend     # client on 5173, /api proxied to 4173
npm run demo --workspace @flashlearn/frontend    # standalone showcase built from the sample deck
npm run test --workspace @flashlearn/frontend
```

The build reads the running project through `GET /api/cards`; `--mode demo` builds the bundled sample deck instead. See `AGENTS.md` for why that selection lives in `client/vite.config.ts` rather than a `.env` file.

`client/scripts/shot.mjs` captures UI states. Browser checks use the Playwright development dependency. Install browser libraries when needed:

```bash
npm exec --workspace @flashlearn/frontend -- playwright install --with-deps chromium
```
