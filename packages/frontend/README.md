# Frontend Workstream

**Owner:** Sara

The Teams-style React UI, HTTP handlers, static assets, and demo now live in this package. The previous root `app/` has been consolidated here. No sibling implementation imports are required.

## Live local application

`npm run build` at the repository root compiles the frontend server and the React UI. `flashlearn start` already calls the preserved `createFlashLearnServer(services)` export, which delegates to the production `FrontendService` and serves `dist/web` and `/api` on the same origin. Build output paths are resolved relative to the module, not the selected project directory.

```bash
npm ci
npm run build
npm run cli -- start /absolute/path/to/initialized-project
```

For UI-only development with a running local CLI server at `localhost:4173`:

```bash
npm run dev --workspace @flashlearn/frontend
```

Vite proxies `/api` to that server. No demo fallback is used on API failure.

- The catalogue loads through `GET /api/cards` for counts.
- Start/next uses `GET /api/cards/next`; the learning engine determines review order.
- Reveal fetches `GET /api/cards/:id`.
- All four ratings post to `POST /api/review`. The UI displays the returned `nextReview`, never a hard-coded interval.
- Failed reviews keep the current card for retry. Loading, empty-deck, and no-due-card states are explicit.
- Source path and SHA come from the card; no fictional source excerpts or mastery counts are displayed in live mode.

The current contract has no topic-filtered due queue or multiple-choice distractors. The live flow uses answer reveal and self-assessment rather than recreating selection/scoring logic in the UI.

## Static public demo

```bash
npm run build:demo --workspace @flashlearn/frontend
npm run preview:demo --workspace @flashlearn/frontend
```

The demo build is `dist/demo`, separate from the live `dist/web` build. Relative asset paths work at GitHub Pages repository subpaths. Its only data source is `test/fixtures/demo.ts`: hand-authored public examples from an **imaginary sample repository**, clearly labeled throughout the UI. Progress is session-only, resets on reload, and does not imitate the learning engine. It never reads `.flashlearn`, contacts the API, or uses endpoint credentials. The live build excludes the sample fixture via a build-time mode switch.

`.github/workflows/pages.yml` builds and uploads **only** `packages/frontend/dist/demo` on pushes to `main` or manual dispatch; deployment is restricted to `main`. Enable **Settings → Pages → Source: GitHub Actions** for the repository, then merge this workflow. The expected project site is `https://flashlearn-ai.github.io/flashlearn/` (or the URL returned by the deployment job).

## Server API

`FrontendService.createServer(services)` returns an unbound Node server. `renderPage()` returns the built HTML shell. `FrontendServices` is injected by CLI; it owns persistence and scheduling orchestration outside this package. `MockFrontendServices` remains an explicit development fake.

API JSON shapes remain in `contracts/http.md`. Invalid JSON/reviews return 400, missing cards/no due card return 404, non-JSON review requests return 415, oversized review bodies return 413, and unexpected service failures return 500. Static serving is restricted to the built UI directory, including resolved symlinks. A missing UI build returns 503 with a build instruction.

## Verification

```bash
npm run test --workspace @flashlearn/frontend
npm run typecheck --workspace @flashlearn/frontend
npm run build --workspace @flashlearn/frontend
npm run build:demo --workspace @flashlearn/frontend
npm exec --workspace @flashlearn/frontend -- playwright install chromium
npm run test:browser --workspace @flashlearn/frontend
```

Root CI now builds both modes and runs Chromium smoke tests: live reveal/review flow, review-error retry, and a mobile demo under `/flashlearn/` without API calls. Screenshots and browser reports belong in ignored output directories.

On Linux, browser tests also need Playwright's system libraries: use `npm exec --workspace @flashlearn/frontend -- playwright install --with-deps chromium` where package installation is permitted. The CI job installs these automatically.
