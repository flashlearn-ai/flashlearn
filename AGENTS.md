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

`npm run check` validates package boundaries, typechecks every workspace, and runs all tests.

GitHub CI exposes three independent statuses:

- `CI / Only Edit One Package` validates that a change touches at most one directory under `packages/`.
- `CI / Validate` runs `npm run check`.
- `CI / Build` runs the whole-project build and compiled CLI smoke tests.

Husky installs through the root `prepare` script. Pre-commit runs package boundaries and staged whitespace checks. Pre-push runs package scope, `npm run check`, and `npm run build`. Hooks provide early feedback, but CI remains authoritative because hooks can be bypassed.

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
GET /api/cards/next
GET /api/cards/:id
POST /api/review
```

`GET /api/cards/next` must not expose the answer. `GET /api/cards/:id` reveals the complete card. JSON errors use `{ "error": "message" }`.

Contract changes require coordinated review because all five workstreams may depend on them. When a task appears to require a contract change, first determine whether the behavior can be implemented behind the existing interface. If not, keep the change small, update both contract documentation and affected tests, and clearly call out the compatibility impact.

## Package Notes

### CLI

- Commands are `flashlearn init [directory]`, `flashlearn generate [directory]`, and `flashlearn start [directory]`.
- General options are `--help`, `-h`, `--version`, and `-v`; start also accepts `--host` and `--port`.
- Exit code `0` means success, `1` means execution failure, and `2` means invalid arguments.
- `src/index.ts` is the executable entrypoint, `src/cli.ts` parses commands, `CliService` orchestrates, and `src/production.ts` wires real package implementations.
- Keep external capabilities behind the CLI-owned interfaces in `src/dependencies.ts` so orchestration stays testable.
- Use `projectRoot()` and `flashlearnRoot()` from `src/paths.ts` for project paths; do not reconstruct `.flashlearn/` paths elsewhere in the CLI.
- CLI selects paths and composes services; extraction owns actual repository traversal.
- CLI starts the server; frontend owns HTTP routing and browser behavior.
- Do not move scheduling, extraction, persistence, or UI logic into the CLI.

### Extraction

- `QuestionExtractor` is the extension point for an AI-backed generator.
- `AnnotationExtractor` is only the deterministic baseline.
- Ignore generated, dependency, Git, and FlashLearn state directories when traversing.
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
