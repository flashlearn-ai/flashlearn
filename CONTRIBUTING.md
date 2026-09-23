# Contributing to FlashLearn

Thanks for helping people learn their projects faster. Report bugs or suggest improvements in [GitHub issues](https://github.com/flashlearn-ai/flashlearn/issues). For substantial changes, describe the problem and proposed behavior before implementing them.

## Development setup

Use Node.js **22.14+**, npm, and Git. CI runs Node.js 24.

```bash
git clone https://github.com/flashlearn-ai/flashlearn.git
cd flashlearn
npm ci
npm run check
npm run build
```

Run the checkout CLI against a project:

```bash
npm run cli -- generate --project /path/to/repo
npm run cli -- review --project /path/to/repo
npm run cli -- start --project /path/to/repo
```

The runner rebuilds stale workspace outputs and uses the repository root as its working directory. Use `--project` to select your study project. For a global development command, `npm link` exposes `flashlearn` from the checkout and preserves the caller's working directory. Use `npm --silent run cli -- project status --project /path/to/repo -o json` for structured output.

For browser development, run `npm run dev --workspace @flashlearn/frontend`. Vite serves port 5173 and proxies `/api` to a running `flashlearn start` server on port 4173; `FLASHLEARN_API` overrides the target.

## Architecture and package responsibilities

| Package | Responsibility | Contract responsibility |
| --- | --- | --- |
| `packages/cli` | Commands, inference configuration, generation orchestration, terminal review, service composition | `Card`, project-root resolution, CLI options |
| `packages/extraction` | Repository scanning and attributed source extraction | `SourceDocument`, `GeneratedCard` |
| `packages/storage` | JSON repositories, atomic persistence, `.flashlearn/` layout | `CardRepository`, `ReviewRepository` |
| `packages/learning` | Review scoring, scheduling, due-card selection | `ReviewState`, `ReviewResult` |
| `packages/frontend` | HTTP server and browser study experience | `CardPreview`, `ProjectIdentity`, review requests and HTTP payloads |

Only the CLI imports and composes other package implementations. The other packages depend on shared contract types rather than each other's code. Keep scheduling in learning, persistence in storage, and browser presentation in frontend; the CLI owns terminal presentation.

The shared declarations are in [`contracts/index.d.ts`](contracts/index.d.ts) and [`contracts/http.md`](contracts/http.md). Contract changes need coordinated review of affected producers and consumers; prefer implementing behind the existing interface. Package READMEs contain detailed service boundaries and tests. [AGENTS.md](AGENTS.md) is the coding-agent guide.

### Runtime data and current limits

- Cards and canonical review state live under each project's `.flashlearn/`. AI checkpoints live under `.flashlearn/generation/`. Browser topic-insights events are separate, device-local history.
- Keep generated cards, ingested repository content, credentials, and build output out of commits. Use small, public test fixtures under `test/fixtures/` when needed.
- Cards carry source paths and commit attribution when available; non-Git folders use `sha: "unknown"`.
- Live cards have no stored source excerpts; the bundled demo supplies its own excerpts. Review operates on one project at a time. Card-quality feedback collection and mastery reporting are not implemented.
- Source evidence and heuristic filters do not prove answer correctness. New generation behavior should be evaluated for complete answers, useful questions, and faithful attribution.

## Pull requests

1. Branch from current `main` and keep the change focused. Explain user-visible behavior and how you verified it.
2. Limit implementation changes to **one package per PR**. Coordinated root documentation and package-root `README.md` edits may span packages; other package files count toward the scope gate.
3. Preserve ESM conventions, strict TypeScript, dependency injection, and package boundaries. Add tests for meaningful behavioral changes.
4. Update user documentation with changes to commands or configuration: the package README, `release/README.md`, and `site/docs/index.html`. Keep the root README concise and focused on value, quickstart, and architecture.
5. Run the checks below. CI validates package scope, generated-content exclusions, boundaries, tests, builds, and release/site artifacts.

Husky installs with `npm ci`. Pre-commit checks boundaries, staged whitespace, and generated/confidential content. Pre-push checks package scope and runs the full checks/build. Maintainers review shared-contract and infrastructure changes alongside the affected packages.

## Verification

```bash
# Required before submitting
npm run check
npm run build

# Focused package tests while developing
npm run test --workspace @flashlearn/cli
```

For release-facing or site changes:

```bash
npm run release:check
npm run site:build -- --demo
npm exec --workspace @flashlearn/frontend -- playwright install --with-deps chromium
npm run site:test
```

Browser behavior changes also need `npm run test:browser:live --workspace @flashlearn/frontend` after building. `npm run site:preview` serves the built site at `http://127.0.0.1:4182/flashlearn/`. Default site builds omit the sample demo; `--demo` includes it.

The [release runbook](docs/release-readiness.md) covers artifact verification, npm publishing, and Pages deployment. Publish only the built `@flashlearnai/cli` artifact; the implementation workspaces are private.
