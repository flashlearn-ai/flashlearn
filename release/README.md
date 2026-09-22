# FlashLearn

Agentic AI for compounding learning velocity. Turn unfamiliar repositories into
source-attributed study cards and review them in a local Teams-style interface.

## Install

Requires Node.js 22.14+ and Git on PATH for Git attribution.

```bash
npm install --global @flashlearnai/cli
flashlearn --help
flashlearn --version
```

Or run without a global installation: `npx @flashlearnai/cli --help`.
The npm package is `@flashlearnai/cli`; the executable is `flashlearn`.
The package includes compiled JavaScript and the live UI. No workspace build,
TypeScript, or tsx installation is required.

## Quick start

```bash
flashlearn generate --project /path/to/repository
flashlearn start --project /path/to/repository
```

Open `http://localhost:4173`. `generate` creates missing storage automatically;
`init` is optional storage-only setup and preserves existing data.

Every command defaults to the current working directory. Use `-p, --project`
before or after the command to target another directory for that invocation.
Relative paths resolve against the working directory.

```bash
flashlearn project show --project /path/to/repository
flashlearn project status -p /path/to/repository -o json
flashlearn question list -p /path/to/repository -o yaml
flashlearn question get CARD_ID -p /path/to/repository
```

Queries accept `-o, --output text|json|yaml` (default text). Project diagnostics
and generation progress go to stderr, keeping query stdout parseable.
Run `flashlearn <command> --help` for details.

**Migration:** `FLASHLEARN_PROJECT` and old saved user configuration are ignored
and left untouched. `project set` has been removed and exits 2 with migration
guidance. Positional directories still work for `init [directory]`,
`generate [directory]`, and `start [directory]`, but cannot be combined with
`--project`. Repeated project flags are invalid.

## Empty decks and scoped generation

Generation displays progress and elapsed time on stderr and saves at most **100 new or updated cards per run**. Existing cards are retained. Use `flashlearn generate --copilot` to explicitly select Copilot (`auto` with fast routing), or `--copilot-model <name>` to select a model; either overrides endpoint environment configuration. Interactive Copilot acceptance uses `auto` without another prompt.

Generation first excludes dependency/license copies, hidden agent tooling, tests and process docs. It prioritizes README and linked architecture/glossary docs, then groups important code by subsystem. All AI providers use up to eight parallel batches of four files and 7,000-character excerpts. Calls allow five minutes with ongoing elapsed progress. AI questions cite evidence from code or documentation and are ranked for understanding, diversity and reduced redundancy. Documentation claims are labeled, including aspirational design caveats. Evidence matching is not a factual correctness guarantee. Failed/empty batches are reported; no deterministic filler pads the deck to 100. Offline mode provides labeled section/doc-comment recall. Duration still depends on repository size and provider latency.

The LLM then organizes accepted cards into learning categories, also allowing five minutes. Labels are saved as card tags and used by the topic chooser. Each category must contain at least five cards, with every card assigned exactly once. Completed AI batches and categories are checkpointed in `.flashlearn/generation/` until card persistence completes. Repeat the same command with the same provider/model/scope to resume unfinished work; category failures do not discard generated candidates. Changed source content invalidates stale work. Use `generate --fresh` to start over explicitly. No API keys are persisted. Unfinished cards do not appear in the study deck. Existing untagged cards and offline deterministic runs continue to use directory-derived topics.

If `start` finds an empty deck, an interactive terminal asks whether to generate
cards first (default no), noting that a configured AI endpoint may be used.
Non-interactive runs exit 1 with guidance unless `start --yes` (or `-y`) approves
generation. Existing cards are not regenerated. Failed generation or a still-empty
deck prevents server startup.

```bash
flashlearn start --project /path/to/repository --yes
flashlearn generate --project /path/to/repository --subpath src --max-files 20
```

`--subpath` is a repository-relative directory, not an individual file; absolute
paths and `..` segments are invalid. `--max-files` is a positive safe integer
limiting eligible files after importance ranking, not filesystem traversal or cards. Both flags belong to `generate`
only; run it before `start` to scope first-run generation. By default generation
scans the whole project with no file limit. Attribution stays relative to the
project root.

Generation reports new or updated cards and the total available for study. It
upserts without pruning existing cards outside the scan. Producing zero cards
can succeed if a previous deck remains; no available study cards means exit 1.
Exit codes are 0 for success, 1 for operation failure, and 2 for invalid arguments.

## Live study

The local UI uses `GET /api/cards/next` to select each due card on the server;
`GET /api/cards` supplies the deck, and `GET /api/project` names the
project the deck came from when it declares one. Study what is due, or choose
topics yourself; a topic session is an early review rather than the due queue,
because the next-card endpoint has no topic filter. Cards arrive as multiple
choice or as recall, mixed by default, with **Mixed**, **Multiple choice** and
**Recall only** offered before a session starts. Answers come from the loaded
deck; `GET /api/cards/:id` fetches a card that became due after that load. Rate
each card incorrect, hard, correct, or easy. Sessions stop after 12 acknowledged reviews; incorrect
cards may be due again immediately and repeats count toward the cap.

Ratings are saved through `POST /api/review`. The UI shows **Saving review…**
until confirmation, displays the server's due date, and waits for **Next due card**.
Failed or malformed acknowledgements block advancement and new sessions and let
you retry the same rating. A lost response may mean the save already succeeded;
without an idempotency key, retrying can record the rating twice.

Saved schedules survive reloads, while the session transcript resets. The server
selects due cards again rather than replaying future cards. No cards due (a `404`
from the next-card endpoint) is distinct from an empty project.

## Local data and endpoints

Cards, review state, and settings are stored in the project's `.flashlearn/`.
Keep that directory out of version control. The server binds to localhost by
default on port 4173; use `start --host <host> --port 4180` to override the bind
address and port. Wildcard hosts `0.0.0.0` and `::` are rejected.

Setting both `FLASHLEARN_ENDPOINT_URL` and `FLASHLEARN_ENDPOINT_MODEL` enables a
chat-completions endpoint. Otherwise, interactive generation detects GitHub Copilot
CLI and asks before using `copilot -p`, then offers OpenAI, Claude, custom endpoint,
or deterministic extraction. Prompted API keys are held only for that command and
are never persisted. Non-interactive runs clearly fall back to deterministic
generation. Any selected AI provider receives code; its access controls and
retention policy are separate from local repository permissions.

The GitHub Pages showcase uses only public hand-authored samples in multiple-choice
sessions of up to 12 cards. Selected topics share the slots, with the starting topic
rotating when topics outnumber slots and each topic advancing by cards actually
dealt. Ratings and topic/card cursors are session-only and reset on reload. It does
not read your project, contact an API, or save a learning-engine schedule.

## Upgrade and support

```bash
npm install --global @flashlearnai/cli
```

Report reproducible issues at https://github.com/flashlearn-ai/flashlearn/issues
with the CLI version and Node version. Do not attach private source, generated
decks, or credentials. MIT licensed; see LICENSE and THIRD_PARTY_NOTICES.txt.
