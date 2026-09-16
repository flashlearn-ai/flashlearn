# Frontend Workstream

**Owner:** Sara

Two halves in one package. `src/` is the Node server that answers the four locked HTTP endpoints and serves the built client. `client/` is the browser client, a Vite and React tree with its own tsconfig, because the server compiles to `NodeNext` and emits while the client resolves through a bundler and does not.

`createFlashLearnServer(services)` is what the CLI composes; `FrontendServices` is an injected consumer port, not frontend-owned business logic. Do not access JSON storage or implement scheduling here. `MockFrontendServices` supplies empty API data for building against.

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

`client/scripts/shot.mjs` captures UI states and needs Playwright, which is deliberately not a dependency. Install it when you want screenshots:

```bash
npm i -D playwright --workspace @flashlearn/frontend
```
