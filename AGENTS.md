# FlashLearn Agent Guide

This file is the primary development context for coding agents working in this repository. Read it before editing code. See `README.md` for product and contributor context.

## Product Goal

FlashLearn turns a Git repository into attributed question-and-answer cards and presents them through a local spaced-repetition experience.

```text
Directory/repository
  -> question extraction
  -> card storage
  -> learning engine
  -> local UI
```

The architecture is optimized for five contributors working independently. Stable contracts are more important than sharing implementation code.

## Runtime And Tooling

- Node.js 22 or newer; CI uses Node.js 24.
- TypeScript with ESM and `NodeNext` module resolution.
- npm workspaces; do not introduce another package manager.
- Node's built-in test runner, executed through `tsx`.
- JSON is the local persistence format.
- Generated output belongs in `dist/` and must not be committed.
- Runtime state belongs in `.flashlearn/` and must not be committed.

Install and verify from the repository root:

```bash
npm install
npm run check
npm run build
```

`npm run check` validates package boundaries, confirms the lockfile resolves from the public npm registry, typechecks every workspace, runs the repository script tests, and runs all workspace tests.

Scripts under `scripts/` are covered by `test/*.test.mjs` at the repository root, run through `npm run test:scripts`. Workspace tests stay inside their own package.

Run the source CLI from the repository root with `npm run cli -- <command>`. The runner uses input/output fingerprints to reuse valid sibling builds and rebuild changed or missing outputs, including the live frontend bundle. Cache metadata lives in `node_modules/.cache/flashlearn/`. It uses the repository root as its working directory. Use `--project` to target another directory and `npm --silent run cli -- project status -o json` for structured stdout; build logs and project/progress diagnostics belong on stderr.

Pin external GitHub Actions to full commit SHAs with a release-version comment. JavaScript actions use Node 24; check composite actions' nested dependencies too when updating pins. The action runtime is separate from the project Node version selected by `setup-node`.

GitHub CI exposes four independent statuses:

- `CI / Only Edit One Package` validates that a change touches at most one directory under `packages/`. It compares against the merge base, so unrelated packages that land on `main` after a branch is cut do not count against it. The job needs full history (`fetch-depth: 0`).
- `CI / No Generated Content` rejects generated cards, ingested repository content, and credentials. It matches on path and on content, so a renamed card dump is still caught. The job needs full history (`fetch-depth: 0`).
- `CI / Validate` runs `npm run check`.
- `CI / Build` runs the whole-project build and compiled CLI smoke tests.

Husky installs through the root `prepare` script. Pre-commit runs package boundaries, staged whitespace checks, and the generated-content gate. Pre-push runs package scope, `npm run check`, and `npm run build`. Hooks provide early feedback, but CI remains authoritative because hooks can be bypassed.

For stacked PRs, push with `FLASHLEARN_SCOPE_BASE=<parent-branch> git push` so the local package-scope check compares against the intended PR base. The default remains `origin/main`; CI always checks the actual PR base. Merge parent PRs first and rebase/retarget children before merging them.

Generated cards and ingested repository content are local-only. `.gitignore` is not sufficient on its own because `git add -f` bypasses it, which is why the gate runs in CI. Legitimate sample data belongs under a `test/fixtures/` directory.

## Ownership Boundaries

| Owner | Package | Scope |
| --- | --- | --- |
| David | `packages/cli` | Commands, configuration, orchestration, startup, and integration |
| Manasa | `packages/extraction` | Repository traversal, extraction, generated questions/answers, and source attribution |
| Sagar | `packages/storage` | JSON persistence and repository implementations |
| Jenny | `packages/learning` | Scheduling, review scoring, and next-card selection |
| Sara | `packages/frontend` | HTTP handlers, card UI, user actions, and fake Teams experience |

Default to editing only the package relevant to the task. Keep implementation, package configuration, and tests inside that package. Do not make opportunistic changes in other packages.

Shared paths require explicit cross-workstream intent:

- `contracts/`
- root `package.json` and `tsconfig.base.json`
- `scripts/`
- `.github/`
- CLI integration code when wiring another package

`packages/cli` is the composition root and may import all package implementations. Extraction, storage, learning, and frontend must not import one another. They may import only platform dependencies, their own code, and types from `contracts/`. `npm run boundaries` enforces this rule.

The pipeline is a data handoff, not an import chain:

```text
David -> Manasa -> Sagar -> Jenny -> Sara
```

Use dependency injection and package-local mocks when another workstream is unfinished. Do not bypass a contract by importing another package's internal files.

## Locked Contracts

The authoritative TypeScript contract is `contracts/index.d.ts`. The authoritative HTTP contract is `contracts/http.md`. Do not silently change either file to accommodate an implementation.

The shared models are:

- `Card`: generated knowledge plus stable ID, timestamps, optional tags, and source attribution.
- `GeneratedCard`: question, answer, and source only. It must not contain learning or UI state.
- `ReviewState`: scheduling metadata owned by the learning engine and stored separately from cards.
- `ReviewResult`: `easy`, `hard`, `correct`, or `incorrect`.
- `CardRepository`: `save`, `get`, `list`, and `delete`.
- `ReviewRepository`: `get` and `save`.

Every card source must contain both repository-relative `path` and Git `sha`. Keep learning metadata separate from card generation.

Every shared contract type must have exactly one semantic owner among the five packages, even though cross-package declarations remain physically in `contracts/`. Current ownership is: CLI owns `Card` and project-root resolution; extraction owns `GeneratedCard`; storage owns `.flashlearn/` contents and repository interfaces; learning owns `ReviewState` and `ReviewResult`; frontend owns HTTP request and response shapes. New contract types must be assigned to one package and shown inside that package's colored region in the README contract map. Keep the map readable in two dimensions: CLI is the orchestration layer above a left-to-right package pipeline. Use solid arrows for adjacent contract handoffs and dashed arrows for CLI composition; avoid other cross-links that tangle the diagram. Preserve the map legend: ⚙️ method, 🧩 type, 🌐 HTTP endpoint, and 📁 local storage.

The locked endpoints are:

```http
GET /api/cards
GET /api/project
GET /api/cards/next
GET /api/cards/:id
POST /api/review
```

`GET /api/cards/next` must not expose the answer. `GET /api/cards/:id` reveals the complete card. JSON errors use `{ "error": "message" }`.

Contract changes require coordinated review because all five workstreams may depend on them. When a task appears to require a contract change, first determine whether the behavior can be implemented behind the existing interface. If not, keep the change small, update both contract documentation and affected tests, and clearly call out the compatibility impact.

## Package Notes

### CLI

- Commands are `flashlearn init [directory]`, `flashlearn generate [directory]`, `flashlearn start [directory]`, `flashlearn project show`, `flashlearn project status`, `flashlearn question get <card-id>`, and `flashlearn question list`.
- Every command defaults to the invocation's working directory. `-p, --project <directory>` overrides it for that invocation, before or after the command; relative paths resolve against cwd. Positional lifecycle directories remain supported but cannot be combined with `--project`. Repeated project flags are invalid.
- `FLASHLEARN_PROJECT` and the old saved user config are ignored and left untouched. `project set` is removed and returns exit code 2 with migration guidance. `init` only initializes storage, never a future project selection.
- Query commands support `-o, --output text|json|yaml`. Project diagnostics and generation progress go to stderr, keeping query stdout parseable; help/version omit project diagnostics.
- Recommend `generate` then `start`: generation initializes missing storage automatically, making `init` optional. An empty-deck `start` asks for confirmation in a terminal (default no); non-interactive runs fail with guidance unless `--yes`/`-y` approves generation, which may use a configured endpoint. Existing cards are not regenerated. Failed generation or a still-empty deck prevents startup.
- `generate --subpath <directory> --max-files <number>` passes extraction scope without changing the project root. Subpaths must be repository-relative directories without `..`; the file limit must be a positive safe integer. These flags belong to `generate` only. Generation upserts rather than pruning existing cards; no available study cards afterward means exit code 1.
- General options are `--help`, `-h`, `--version`, and `-v`; start also accepts `--host` and `--port` (default `localhost:4173`; wildcard hosts `0.0.0.0` and `::` are rejected).
- Exit code `0` means success, `1` means execution failure, and `2` means invalid arguments.
- `src/index.ts` is the executable entrypoint, `src/cli.ts` parses commands, `CliService` orchestrates, and `src/production.ts` wires real package implementations.
- Keep external capabilities behind the CLI-owned interfaces in `src/dependencies.ts` so orchestration stays testable.
- Use `projectRoot()` and `flashlearnRoot()` from `src/paths.ts` for project paths; do not reconstruct `.flashlearn/` paths elsewhere in the CLI.
- CLI selects paths and composes services; extraction owns actual repository traversal.
- After AI quality selection, an LLM groups questions/answers into learning categories, validated as an exact partition with at least five cards per category. Persist labels in existing `Card.tags` through CLI-owned `StudyGeneratedCard`; do not change extraction's locked `GeneratedCard`. Offline/legacy untagged cards retain frontend path grouping. Generation and category calls allow 15 minutes each, including one visible category-repair attempt if needed. CLI-owned generation checkpoints atomically retain completed batches and categorized results under `.flashlearn/generation/` until all card upserts complete. Retry matching provider/model/scope automatically; fingerprint selected working-tree content, never persist credentials, and support `generate --fresh`. Unfinished cards must not enter the study deck. Use numbered stages and indented events, report active/failed/reused batches and request timing, and end the progress line before errors. Plain output has ten-second heartbeats; TTY status must not wrap.
- CLI generation uses extraction's public scan/validation APIs, caps each run at 100 accepted/persisted cards, and emits progress on stderr. Copilot defaults to `auto` fast routing; `--copilot` or `--copilot-model <name>` explicitly opts in. Classify/filter source locally, reserve README/doc batches, group related code, and apply maxFiles after ranking. All AI providers use the shared curriculum prompt/evidence gate with eight concurrent four-file batches, bounded excerpts/timeouts, and no filler. Rank for foundations, reject incomplete/trivial answers, heuristically deduplicate, and limit source dominance; evidence matching is not semantic proof. The cap never prunes stored cards. Benchmark tooling in `packages/cli/scripts/benchmark-generation.mjs` uses a temporary clone and optional `--keep` for evaluation.
- CLI starts the server; frontend owns HTTP routing and browser behavior.
- Do not move scheduling, extraction, persistence, or UI logic into the CLI.

### Extraction

- `QuestionExtractor` is the extension point for an AI-backed generator.
- `MarkdownExtractor`, `JsDocExtractor`, `GoDocExtractor`, and `ExportSignatureExtractor` are the deterministic baseline, combined by `CompositeExtractor` in `deterministicExtractor()`.
- `EndpointExtractor` sends code files to a chat-completions endpoint configured through `FLASHLEARN_ENDPOINT_URL` and `FLASHLEARN_ENDPOINT_MODEL`. `defaultExtractor()` selects it when both are set and falls back to the deterministic baseline otherwise, so runs work offline.
- Interactive CLI generation can select GitHub Copilot CLI, OpenAI, Anthropic Claude, a custom OpenAI-compatible endpoint, or deterministic extraction. Copilot requires confirmation, prompted API keys are current-run-only, and deterministic fallback must be explicit.
- Stamp `source` from the scanned path and SHA, never from a model reply. A failed request must yield no cards rather than abort a repository-wide run.
- Supported sources are `.go`, `.js`, `.jsx`, `.md`, `.ts`, and `.tsx`.
- Ignore generated, dependency, Git, and FlashLearn state directories when traversing.
- Skip machine-generated sources during traversal, by filename and by Go's `// Code generated ... DO NOT EDIT.` marker, along with `_test.go` and `CHANGELOG*.md`. Sniff only the head of a file for the marker; generated files can be megabytes.
- `GenerateOptions` (`subpath`, `maxFiles`) narrows a run. Keep the root at the repository root when scoping, so Git attribution resolves and `source.path` stays repository-relative.
- `validateCards()` filters cards that would waste review time: locator questions, answers too short to teach, answers restating the question, answers leaning on omitted context, and questions repeated across files. Deduplication is repository-wide, so it runs after all documents are extracted. Use `generateWithRejections()` when a caller needs to report what was filtered; rejections carry a reason so filtering is never silent.
- Return `GeneratedCard[]`; do not assign IDs, timestamps, or review metadata here.

### Storage

- `.flashlearn/cards.json` is an array of cards.
- `.flashlearn/review.json` is an object keyed by card ID.
- `.flashlearn/settings.json` contains local configuration and schema version data.
- CLI resolves and passes the project root; storage owns creating and persisting `.flashlearn/` contents.
- Preserve atomic writes and idempotent initialization.
- Storage must not contain scheduling, extraction, or presentation decisions.

### Learning

- Scheduling functions should remain deterministic when given an explicit time.
- Keep review calculations pure where practical.
- Learning receives cards and review state through contracts; it does not load files or know how cards were generated.

### Frontend

- `FrontendServices` is the injected boundary used by HTTP handlers.
- Keep endpoint payloads aligned with `contracts/http.md`.
- `src/` is the Node server. `client/` is the Teams-style browser client built with Vite and React; `npm run build --workspace @flashlearn/frontend` compiles the server, then builds the client into `client/dist`.
- The server serves `client/dist` for every non-`/api` GET, falling back to the client shell so the browser owns routing. Unknown `/api/*` paths still return a JSON `404`.
- `client/src/deckSource.ts` selects where cards come from via `VITE_DECK_SOURCE` during development: `fixture`, `api` for `GET /api/cards`, or a URL returning `Card[]`. It validates at the boundary and surfaces failures rather than silently substituting the fixture. Official builds force the appropriate source through Vite's `define`; do not move this into ignored `.env` files.
- Live study offers two ways in. **Study what's due** uses `GET /api/cards/next`, so the schedule picks the order. **Choose topics** deals a session client-side from `GET /api/cards`, which is an early review rather than a due queue and must never be presented as one: the locked next-card endpoint has no topic or exclusion filter, so topic selection cannot come from the schedule. Both routes deal every card through `dealCard`, so a card arrives as multiple choice or as recall regardless of which route asked for it and both alternate the same way; a start-screen control forces one kind for the session, defaulting to mixed. `wasCorrect()` scores a card by the option picked when it was a question and by the rating when it was recall, so no view can disagree about the same card, and both persist ratings through `POST /api/review` and record confirmed reviews to the browser's history. Answers come from the deck already loaded; `GET /api/cards/:id` fetches a card that became due after that load. Reload starts a fresh transcript using the persisted server schedule; a next-card `404` means nothing is due, not an empty project.
- `client/src/lib/review.ts` posts all four locked ratings to `POST /api/review` and validates the returned `ReviewState`. Due dates come from that response; the client never computes an interval. Live study waits for save confirmation and an explicit **Next due card** click before advancing. Pending saves say **Saving review…**; failed or malformed acknowledgements allow retry of the same rating and block advancement/new sessions. A lost response may follow a successful save; without an idempotency key, retrying can record the rating twice.
- Release builds force the API source; demo builds force fixtures and write `client/dist-demo` separately from live `client/dist`. Demo ratings are session-only and must never contact `/api` or claim persisted schedules. Asset URLs must respect Vite's base for Pages subpaths.
- `client/src/sample.ts` holds the sample deck and its excerpts, `client/src/topics.ts` holds per-topic identity, and `client/src/excerpts.ts` is the registry the deck source populates so the live build never imports sample content. `test/sample-deck.test.ts` asserts every card cites a file that exists and quotes it verbatim, because a deck that invents attribution discredits the product's central claim.
- Live sessions are capped at 12 acknowledged reviews (`SESSION_LIMIT`); immediately due incorrect-card repeats count toward the cap. Demo and fixture/URL practice use the same mixed choice/recall presentation with session-only ratings, capped at 12 cards: selected topics take turns filling a session, the starting topic rotates when topics outnumber slots, and per-topic cursors advance by cards actually dealt. Practice ratings and cursors reset on reload.
- Source excerpts exist only for the sample deck. A live `Card` carries `path` and `sha` but no snippet, and nothing in the contract reports mastery, so the client shows card counts and attribution rather than inventing either. Absences of this kind are listed under "Deliberate Omissions" in the root README; do not scaffold a stub for one, because a function that can only return nothing is dead code and fixes another package's interface before its owner has chosen it.
- `npm run dev --workspace @flashlearn/frontend` serves the client on port 5173 and proxies `/api` to a `flashlearn start` server; override the target with `FLASHLEARN_API`.
- `client/scripts/shot.mjs` captures optional UI screenshots; release browser checks use the Playwright development dependency.
- `test:browser` uses the frontend's Playwright development dependency to test built Pages artifacts; browser system dependencies are installed by CI. After building the live client, run `npm run test:browser:live --workspace @flashlearn/frontend` for desktop/mobile live-flow checks against package-local injected services. Disk persistence and the real learning algorithm remain integration-test responsibilities.
- The local page must work on desktop and mobile.
- Frontend must not read JSON files or calculate review schedules directly.

## Development Rules

- Prefer the smallest correct implementation behind the existing contract.
- Use strict TypeScript; do not solve type errors with `any` or unchecked casts unless the boundary genuinely has unknown input and validation follows immediately.
- Keep ESM import conventions. Relative TypeScript imports use `.js` extensions for `NodeNext` output.
- Preserve source attribution and ISO 8601 timestamps.
- Validate untrusted HTTP and filesystem input at the owning boundary.
- Avoid adding dependencies when Node.js APIs are sufficient.
- Do not add cross-package helpers. Duplicate a small package-specific helper rather than coupling independent workstreams.
- Do not edit generated `dist/` files or `package-lock.json` manually.
- Do not commit `.flashlearn/`, secrets, tokens, or repository content ingested during local testing.

## Testing And Completion

Put tests in `packages/<name>/test/**/*.test.ts`. Run the focused workspace test while developing:

```bash
npm run test --workspace @flashlearn/extraction
npm run typecheck --workspace @flashlearn/extraction
```

Replace the workspace name with the package being changed. Before considering a task complete, run from the root:

```bash
npm run check
npm run build
```

Add or update tests for behavioral changes. Important integration invariants include:

- initialization creates all three storage files without replacing existing data;
- generation preserves `path` and `sha` attribution;
- next-card responses hide answers;
- answer endpoints return complete cards;
- review submissions accept only locked review values;
- incorrect reviews become due immediately under the current baseline algorithm;
- non-CLI packages do not import one another.

CLI integration tests use `packages/cli/test/fakes/harness.ts`, which provides in-memory repositories and recording dependencies. Keep package handshake assertions in `contracts.test.ts` and end-to-end orchestration assertions in `pipeline.test.ts`; assert calls and contract data rather than duplicating another package's algorithm.

## Documentation Maintenance

### Public site and releases

- `site/index.html` is the Pages hero. Preserve the three-stage narrative: source existing project knowledge; generate actionable contextual snippets; learn through regular gamified spaced repetition in daily workflows.
- Keep current capabilities distinct from roadmap items. Wiki connectors and native Teams/GitHub/Slack delivery integrations must stay labeled planned until implemented and verified.
- Update `site/docs/index.html`, `release/README.md`, and `docs/release-readiness.md` in the same change as CLI syntax, configuration, installation, endpoints, demo behavior, or supported sources change. Do not document unmerged CLI behavior as available.
- `release/package.json` is the public version source. `site:build` stamps that version into site docs; the installed wrapper reads it for `--version`.
- The public package is `@flashlearnai/cli`; its executable is `flashlearn`. The internal `@flashlearn/cli` workspace remains private: publish only the built release tarball. First publication is owner-authenticated with `--provenance=false`; configure OIDC afterward for the existing provenance-enabled workflow.
- `.github/workflows/publish.yml` publishes on GitHub Release `published` events or manual dispatch with an existing published release tag, not tag pushes. Both paths fetch release metadata and validate tag, manifest version, prerelease flag, and main ancestry. OIDC uses the `prod` environment. Reruns skip only identical registry artifacts; the final job attaches the tested tarball/receipt to the existing release.
- Preserve GitHub-provided environment variables for npm OIDC/provenance. Publishing uses workflow-revision tooling with tagged source in a separate checkout; `FLASHLEARN_RELEASE_ROOT` and `FLASHLEARN_RELEASE_EVENT` carry artifact location and release metadata without rewriting `GITHUB_*` context.
- After successful npm submission, poll up to five minutes for registry integrity verification, retrying propagation/transient failures and logging progress. Authentication and integrity mismatches remain immediate failures; verification must never republish.
- `.github/workflows/create-release.yml` is a main-only manual entrypoint with no tag/version input. It tests the artifact, derives the tag/prerelease flag from the release manifest, pins the tag to the workflow commit, and explicitly dispatches `publish.yml` because built-in-token release creation does not trigger downstream release events. Existing tags at other commits are never moved.
- Verify `release:check`, `site:build`, and `site:test` for release-facing changes. Pages uploads only `.release/site`; npm publishes only the digest-checked `.release/flashlearn.tgz`.
- Pages and release-artifact CI run `npm run site:build -- --demo` so the public `/demo/` link is deployed and browser-tested. Local builds without `--demo` continue to omit sample content.
- Never build release demos from local `.flashlearn` data or configured external deck URLs. Preserve sample-source attribution checks and explicit demo labels.

Treat this file as a living contract. Before completing any development task, compare the change against `AGENTS.md`, the root `README.md`, and the affected package README. Update documentation in the same change when any of these facts change:

- package ownership or allowed dependencies;
- shared models, repository interfaces, endpoints, or storage formats;
- CLI commands, options, defaults, output, or exit codes;
- source layout, integration seams, or dependency-injection boundaries;
- npm scripts, runtime requirements, hooks, test commands, or CI check names;
- important invariants that future contributors must preserve.

The root README feature map is the authoritative high-level status view. It tracks completion of owner workstreams, not the presence of prototype code. Keep it as a numbered list ordered by package (`cli`, `extraction`, `storage`, `learning`, `frontend`). Prefix each item with the package color used in the contract map: 🔵 CLI, 🟢 extraction, 🟠 storage, 🟣 learning, and 🔴 frontend. Each item must put status in the first sub-bullet, followed by owner, features, dependencies, current capability, and next milestone. Update it whenever a change adds, removes, or materially alters a workstream deliverable. Use only these statuses:

- `✅ Done`: the responsible owner has completed and merged the agreed package or shared-infrastructure deliverable;
- `🚧 In Progress`: the owner is still implementing or validating the agreed deliverable.

Do not mark a workstream done based on scaffolds, interfaces, mocks, starter implementations, open pull requests, or unmerged branches. A tested prototype may be listed as the current capability while its owner workstream remains in progress. Keep feature-map rows brief; implementation detail belongs in package READMEs.

Do not rewrite documentation when behavior is unchanged. Keep updates factual and derived from committed code rather than plans. After editing documentation, search for obsolete names and examples, run `git diff --check`, and verify every documented command affected by the change.

When this guide becomes too broad for one package, add a nested `packages/<name>/AGENTS.md`. Nested guides may add package-specific instructions but must not weaken root ownership, contract, or verification rules.

When reporting completion, state the package changed, user-visible behavior, contract impact, and verification commands run.
