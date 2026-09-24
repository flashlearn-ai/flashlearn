# Frontend

HTTP server and browser study experience.

Live study offers the schedule or a topic choice as ways in, and deals every card as multiple choice or recall for variety, with a start-screen control to force one kind, with persisted review acknowledgements. Demo study uses the same presentation with session-only ratings. Multiple-choice distractors are drawn from cards sharing the same question form, falling back to the wider deck when too few match, and hide leading documented symbol names; original answers and attribution remain intact.

The live client records confirmed review submissions in browser `localStorage` and shows hardest-first topic insights for that browser profile, in the desktop details pane or **View topic insights** on mobile. Events snapshot the whole-deck client-resolved topic at review time. Pending, rejected, or malformed acknowledgements and demo/practice ratings are not recorded; clearing site data clears this history.

Two halves in one package. `src/` is the Node server that answers the five locked HTTP endpoints and serves the built client. `client/` is the browser client, a Vite and React tree with its own tsconfig, because the server compiles to `NodeNext` and emits while the client resolves through a bundler and does not.

`createFlashLearnServer(services)` is what the CLI composes; `FrontendServices` is an injected consumer port, not frontend-owned business logic. Do not access JSON storage or implement scheduling here. `MockFrontendServices` supplies empty API data for building against.

The live build uses `client/dist`; `npm run demo --workspace @flashlearn/frontend` writes `client/dist-demo` and never overwrites the live build. Demo assets use relative paths and ratings are session-only, without API calls. Official builds override local `VITE_DECK_SOURCE` settings so release artifacts cannot accidentally load a private deck URL.

Root `site:build` assembles the landing page and tool docs from `site/`; pass `-- --demo` to build this package's demo bundle and publish it under `/demo/`, which a default build omits. Run `site:preview` for a subpath-aware preview and `site:test` for browser checks; the demo browser check skips when the demo was not built. See `docs/release-readiness.md` at the repo root for release and Pages setup.

## Study behavior

- **Live:** `GET /api/cards` supplies the deck, its topic classification, and the answers used for choices and reveals. **Study what’s due** takes each card from `GET /api/cards/next`; **Choose topics** deals a session from the loaded deck, which is an early review rather than a due queue. `GET /api/cards/:id` fetches only a card that became due after the deck loaded. Ratings support all four locked results. The browser displays the server's `nextReview`, never calculates an interval, and requests the next card only after a confirmed save and an explicit **Next due card** click.
- **Persistence:** reload starts a fresh transcript and queries the server's saved schedule. Future cards are not rebuilt into a client-side session. A `404` from the next-card endpoint means no cards are due, distinct from an empty project or a failed request. API responses and client reads disable caching.
- **Bounded live sessions:** at most 12 acknowledged reviews. Incorrect cards may be selected again immediately; repeats count toward the cap. The next-card endpoint cannot filter topics or exclude previously seen cards, so the due route follows server order; topic sessions are dealt client-side and never presented as due.
- **Why a choice was wrong:** a missed multiple-choice card names the card its distractor actually answers (“You picked X — that answers ‘Y’”), because the learning value is in seeing what was confused with what. Correctness is already settled by the click, so only difficulty is asked; every `ReviewResult` except `incorrect` counts as a success in the scheduler, and none of them could honestly follow a wrong answer.
- **Failures:** loading failures have retry controls. A pending review says **Saving review…**, never **Scheduled**. A failed or malformed acknowledgement leaves the current rating retryable and blocks advancement and new sessions. A missing due date says **Review saved · no due date returned**. A lost response can mean a save succeeded; the current contract has no idempotency key, so retrying may record the rating twice. This uncertainty is shown to the user.
- **Demo and fixture/URL practice:** ratings are session-only and never post reviews. Demo sessions remain capped at 12, balance selected topics, rotate the starting topic when topics outnumber slots, and advance each topic by the number of cards actually dealt. Topic/card cursors reset on reload. Demo builds make no API requests.
- **Boundary validation:** preview/full-card input requires nonempty IDs, questions, paths and string SHAs; full cards require answers and string timestamps, with optional string-array tags. Malformed full-deck entries are filtered, and an entirely unusable deck fails visibly. Reveal and preview failures are surfaced rather than substituted. `sha: "unknown"` remains compatible with non-Git extraction and is omitted from attribution display.

No HTTP or shared TypeScript contract changes are required.

| Method | Behaviour |
| --- | --- |
| `createServer(services)` | Handle the five locked endpoints, then serve `client/dist` for any other GET, falling back to the client shell so the browser owns routing. |
| `renderPage()` | Return the built client shell, or build instructions when `client/dist` is absent. |
| `listCards()` | Supply cards for `GET /api/cards`. |
| `nextCard()` | Supply a due card; the handler must hide its answer. |
| `getCard(id)` | Supply a complete card the loaded deck does not have. |
| `submitReview(cardId, result)` | Submit a locked review result and return updated `ReviewState`. |

## Commands

```bash
npm run build --workspace @flashlearn/frontend   # server, then the client into client/dist
npm run dev --workspace @flashlearn/frontend     # client on 5173, /api proxied to 4173
npm run demo --workspace @flashlearn/frontend    # standalone showcase built from the sample deck
npm run test --workspace @flashlearn/frontend
npm run typecheck --workspace @flashlearn/frontend
npm run test:browser:live --workspace @flashlearn/frontend # requires the live build above
```

The live build uses the running project's API; `--mode demo` builds the bundled sample deck instead. Development defaults to the fixture; set `VITE_DECK_SOURCE=api` to exercise live study through the Vite proxy. See `AGENTS.md` for why official build selection lives in `client/vite.config.ts` rather than a `.env` file.

The live Playwright suite starts the real frontend HTTP server against package-local injected services and loads `client/dist`. It covers hidden answers, server due selection, reload persistence, immediate incorrect-card repeats, future-card exclusion, failed selection/reveal/save retries, pending-save races, and the 12-review cap on desktop and mobile. Server-side fixture state survives browser reloads; disk persistence and the real learning algorithm remain CLI/storage/learning integration responsibilities. No cross-package implementation imports or shared browser scripts are used. `test:browser` remains the built Pages/demo check.

For integration, rebuild the frontend before starting the compiled CLI. Run root `check`, `build`, release checks, and rebuild the Pages site before its browser suite; those artifacts are separate from `client/dist`. See [CONTRIBUTING.md](../../CONTRIBUTING.md) for the contributor workflow.

`client/scripts/shot.mjs` captures UI states. Browser checks use the Playwright development dependency. Install browser libraries when needed:

```bash
npm exec --workspace @flashlearn/frontend -- playwright install --with-deps chromium
```
