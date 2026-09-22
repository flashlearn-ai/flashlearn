# CLI Workstream

**Owner:** David

The CLI is the composition root. `CliService` in `src/workstream.ts` orchestrates services, `runCli` in `src/cli.ts` parses commands and formats output, and `src/production.ts` adapts the four package implementations through CLI-owned dependency interfaces.

## Project directory

Every invocation targets its **working directory** unless `-p, --project <directory>` is supplied. Relative paths resolve against that working directory. The flag works before or after the command; `--project=/path` also works. Repeated project flags are invalid.

```bash
flashlearn generate --project /path/to/repo
flashlearn start --project /path/to/repo
flashlearn question list -p /path/to/repo -o json
flashlearn question get CARD_ID -p /path/to/repo -o yaml
flashlearn project status --project /path/to/repo
flashlearn project show --project /path/to/repo
```

**Migration:** `FLASHLEARN_PROJECT` and the old user config are no longer read or written. Existing config files are left untouched. `project set` returns exit code 2 with migration guidance. `project show` remains available and shows this invocation's directory. `init` only initializes storage; it does not select a project for future commands.

Positional directories remain compatibility aliases for `init [directory]`, `generate [directory]`, and `start [directory]`. Supplying both a positional directory and `--project` is an argument error. Query commands use `--project` only.

Commands print `Project: /absolute/path` to stderr before work. Help/version remain quiet. Query stdout stays parseable.

## First run and startup

Recommended flow: **generate → start**. Generation initializes missing storage automatically; `init` is optional storage-only setup. Storage initialization is idempotent and preserves existing data.

```bash
flashlearn generate
flashlearn start
# Or approve generation if the deck is empty:
flashlearn start --yes
```

If `start` finds no cards, an interactive terminal asks whether to generate them before continuing. Confirmation defaults to no and notes that a configured AI endpoint may be used. Non-interactive runs print the required command and exit 1. `start --yes` (or `-y`) approves empty-deck generation without prompting. Existing cards are not regenerated, even when none are due. Failed generation or a still-empty deck prevents server startup.

Generation prints a progress message, the count generated and stored **(new or updated)**, and the total cards available for study. A run producing zero cards can succeed if a previous deck is still available. If no study cards are available afterward, `generate` exits 1 with guidance instead of suggesting startup. Generation upserts cards; it does not prune cards absent from the latest run.

### Inference source

Generation (including empty-deck `start`) begins with a dedicated **INFERENCE SOURCE** stage. When no endpoint environment configuration or explicit flag selects a provider, one menu offers **Copilot, OpenAI, Claude, Custom, or Heuristic**. Copilot detection is shown alongside the other choices rather than taking over setup. Selecting a provider is the opt-in to send source/documentation to it; blank input selects offline heuristic. Unknown selections and invalid custom URLs fail with guidance instead of silently choosing another provider.

```bash
flashlearn generate --inference-source openai
flashlearn generate --inference-source claude
flashlearn generate --inference-source custom
flashlearn generate --inference-source heuristic
```

OpenAI prompts for a masked API key and model (default `gpt-4o-mini`); Claude uses a masked Anthropic key and model (default `claude-sonnet-4-5`). Custom accepts a full HTTP(S) OpenAI-compatible chat-completions URL, model, optional key and header name (`Authorization` by default; `api-key` for raw-key auth). URLs with embedded credentials and invalid HTTP header names are rejected. Prompted keys are used only for the current command and never written to disk or printed in summaries. Blank required settings cancel into the clearly labeled offline mode. A valid key is not a connectivity check; provider errors are reported during inference.

Without a flag, complete `FLASHLEARN_ENDPOINT_URL` / `FLASHLEARN_ENDPOINT_MODEL` configuration retains precedence and is announced in this stage. `--inference-source` overrides it for one invocation; `--copilot` / `--copilot-model` remain shortcuts and cannot conflict with another source flag. Noninteractive runs without endpoint configuration or explicit Copilot opt-in use the offline heuristic. Interactive key entry requires a terminal; configure endpoint environment variables for automation.

Successful lifecycle commands print a `Next:` block with a shell comment and a copyable, quoted command carrying `--project`.

## Extraction scope

Every generation run saves **at most 100 new or updated cards**. Existing cards are retained, so the stored deck can exceed 100 after multiple runs. Stderr shows scan, generation, and persistence progress with elapsed time: a live bar in terminals and throttled plain lines when redirected.

```bash
flashlearn generate --project /path/to/repo --copilot
flashlearn generate --project /path/to/repo --copilot-model auto
```

`--copilot` explicitly opts into sending code to Copilot and overrides endpoint environment configuration for that invocation. `--copilot-model <name>` implies `--copilot` and passes the model to Copilot; default `auto` uses its fast routing tier. Interactive Copilot acceptance also defaults to `auto`, without another prompt. The CLI must be installed and authenticated; missing executables fail with guidance.

### Understanding-first selection

The local first pass excludes license/dependency copies, hidden agent-tooling folders, tests/fixtures, generated sources, and contributor-process documents. It ranks the shallowest README first, boosts its linked design docs, glossary and lifecycle guides, then prioritizes entrypoints and behavior-rich code. Documentation gets reserved batches; related code is grouped by subsystem rather than sampled alphabetically. README context is supplied to every AI request when available **within the selected subpath/file budget**.

Copilot, OpenAI-compatible endpoints, and Claude use the same curriculum prompt for **both code and Markdown**. Up to eight parallel batches (four files each, with a dedicated README batch when present) request at most ten candidates each. Excerpts preserve complete sections/declarations where practical within 7,000 characters per file. Generation and category calls each allow **15 minutes**; Copilot processes are killed on timeout. Provider failures identify timeout, HTTP status, or Copilot exit diagnostics rather than being silently treated as an empty deck.

Progress uses six numbered stages: scan, select, generate, quality review, categorize, and save. Detail lines report provider/model, selected sources, checkpoint location, batch start/completion/failure, candidate counts, and category repair attempts. Live status shows active/failed/reused batches, overall elapsed time and oldest active request time/remaining timeout. Categorization reports waiting for a response, not a fabricated percentage. Narrow terminals clip only the live status; redirected output uses plain lines with ten-second heartbeats and immediate event details. Completion and stopped states have separate headings and end the status line before results/errors.

### Partial progress and retries

Every completed AI batch is atomically checkpointed under `.flashlearn/generation/<run-key>.json` with restrictive file permissions. On a failed batch, successful sibling batches finish and are retained; the next invocation retries only unfinished batches. A categorization failure retains the accepted candidates, so rerunning retries categories without repeating successful source inference. Categorized results are checkpointed too, and removed only after every card has been persisted; interrupted saves can be safely upserted again.

An invalid category partition receives one automatic repair attempt with the validation error (including missing card IDs). Each attempt has the same 15-minute allowance and a visible attempt counter. Timeouts/provider failures pause with retained progress rather than retrying the entire generation automatically; active sibling batches are allowed to finish and checkpoint first.

Repeat the same command and choose the same provider/model and scope (including when `start` offers generation). `generate --fresh` explicitly discards that matching checkpoint. Changed selected working-tree content or README context invalidates the checkpoint automatically. API keys and raw source excerpts are never stored in it; generated candidates remain local runtime data. The ordinary study deck is not populated with unfinished/uncategorized cards. If persistence failed after some cards were saved, use `generate` to resume the remaining saves rather than `start`, which opens an already-populated deck.

### Learning categories

After quality filtering, the selected LLM groups the accepted questions and answers into conceptual learning categories. Every card must appear exactly once and **each category must contain at least five cards**. Related small topics are merged by the model; blank/generic names, duplicate category slugs, missing/duplicate/invalid card IDs, and undersized groups are rejected. The label is persisted in the first `Card.tags` entry, which the existing UI prefers over directory grouping. This CLI-owned enrichment does not change the extraction contract.

If fewer than five AI cards survive, or category inference fails or returns an invalid partition, generation exits with guidance before saving any new cards. It does not invent filler or silently fall back to path-based topics. Offline deterministic runs and pre-existing untagged cards retain the UI's directory fallback; they are not claimed to have LLM categories or a five-card guarantee. The guarantee applies to each successfully generated AI batch, not a manual subset or old deck. Existing cards are preserved on subsequent runs.

Each AI candidate must include a learning objective and a verbatim evidence quote from its cited excerpt. Quotes from another file or invented IDs are rejected; path and SHA are assigned locally. Evidence matching establishes textual support, **not semantic proof of the whole answer**. Documentation-derived questions name their document; documents marked aspirational get an explicit design-status qualification. Stale documentation and model errors still warrant human review.

Quality checks reject vague helper/heading questions, constants/locator trivia, incomplete or truncated answers, and detectable list-count mismatches. Ranked candidates favor architectural foundations and reasoning; token-overlap/concept heuristics remove near-duplicate questions/answers and cap dominance at eight cards per file and 25 per subsystem. These are heuristics, not perfect semantic deduplication. **100 is a maximum, not a target: no deterministic filler is added in AI mode.**

### Offline heuristic quality

Offline mode extracts complete definitions, short explanatory paragraphs and documented code responsibilities from up to 80 ranked files. It preserves paragraph/list-item boundaries, skips fenced code, tables, procedures, badges, demo/tool docs and context-dependent fragments, and uses sentence segmentation rather than cutting at a character budget. Questions identify a defined term, reuse an actual question heading, or ask about the documented responsibility/constraint. Answers remain extractive; architectural claims in aspirational documents are labeled as design intent. This is useful recall from documentation, not inferred understanding or LLM-generated categories.

Substrate experiment (same committed source and file budget): the previous heuristic saved 100 cards, including 69 generic “what is explained about” prompts, 28 tool/demo cards, 2 badge answers and 9 detected dangling-list/Flags fragments. The tuned pass saved 51 cards in about four seconds, with zero of those markers, eight glossary cards instead of two, and average answer length 235 instead of 308 characters. These counts are quality proxies, not accuracy scores; source claims can still be stale and templates remain mechanical. Reproduce the comparison after building with `node packages/cli/scripts/evaluate-heuristic.mjs /path/to/repo`.

This is bounded coverage, not exhaustive analysis. Runs may take several minutes; retaining useful work takes priority over a one-minute target.

### Generation benchmark

After `npm run build`, run:

```bash
node packages/cli/scripts/benchmark-generation.mjs /path/to/repo auto
```

The benchmark clones committed source into a temporary directory, runs the compiled CLI from process launch through persistence, reports elapsed time/card counts, and removes the clone. Add `--keep` after the model to retain the deck/checkpoint for local review. It excludes clone/build time and preserves the original repository's deck. It allows 48 minutes for a run (including a category repair) and exits nonzero for a failed run, zero cards, over 100 cards, untagged cards or a category smaller than five. The under-one-minute measurement is informational, not a pass/fail condition.

Quality evaluation found 47/100 cards from license copies or agent tooling in the earlier fast-generation prototype, and zero project-documentation cards. The revised final-plan run on `~/substrate` with Copilot `auto` took **49.0s**, selecting **36 AI cards (21 code-backed, 15 documentation-backed, including five README cards)** and **zero excluded-source cards**. It classified 512 files, excluded 96, and selected 29 important files across eight batches; one batch yielded no evidence-backed cards. Earlier tuning runs took 33.3–49.0s, with variable output. The reviewed final deck covers actor/worker multiplexing, Kubernetes' role, snapshot tradeoffs, component ownership, request flow, scheduling, cache safety and recovery. Timings are observations, not provider guarantees; no generated deck is committed.

```bash
flashlearn generate --project /path/to/repo --subpath src --max-files 20
```

- `--subpath <directory>` restricts extraction to a repository-relative directory. Default: the whole project. Absolute paths and `..` segments are argument errors. Individual file subpaths are not supported by the existing extraction scanner.
- `--max-files <number>` limits eligible files considered for generation **after** classification/ranking, not filesystem traversal or card count. It must be a positive safe integer; default: no explicit file limit (AI batch/offline budgets still apply). This prioritizes README over lexically earlier tooling files.
- These options belong to `generate` only. To scope first-run generation, run `generate` explicitly before `start`.
- The project root remains unchanged, preserving repository-relative source paths and Git attribution. Scoping does not delete existing cards outside the selected directory.

## Queries and server options

- `project show`, `project status`, `question list`, and `question get <card-id>` support `-o, --output text|json|yaml` (default: text).
- YAML preserves empty lists/objects, including empty card tags.
- `project`, `question`, `help <command>`, and `<command> --help` show contextual usage.
- General options: `--help`, `-h`, `--version`, `-v`.
- Server defaults: `localhost:4173`. `start --host <host> --port <port>` overrides them; wildcard host strings `0.0.0.0` and `::` are rejected.
- Exit codes: 0 success, 1 operation failure, 2 invalid arguments.

## Service boundary and review consistency

| Method | Behavior |
| --- | --- |
| `initialize(root)` | Create or validate `.flashlearn/` without replacing data. |
| `generate(root, options?)` | Pass extraction scope, assign stable IDs/timestamps, persist and return generated cards. |
| `start(root, options?)` | Compose repositories and learning services, then start the frontend server. |
| `resolveProject(directory?)` | Validate the supplied directory, defaulting to the process cwd. |
| `getCard(id, directory?)`, `listCards(directory?)` | Read cards for the supplied directory or process cwd. |
| `status(directory?)` | Count cards, reviewed/unreviewed cards and cards due now. |

The CLI passes its resolved invocation directory explicitly. CLI-owned generation options carry scope, provider/model selection and progress through dependency injection. Extraction's public scanner supplies attributed documents; CLI plans bounded inference and quality ranking. `CliIO.confirm` provides injectable startup confirmation; `src/confirm.ts` implements terminal prompting.

Review submissions serialize the complete card check/read/schedule/save operation per resolved project path and card ID, across service instances in the same process. A rejected operation reaches its caller while subsequent queued requests proceed. Different cards/projects can proceed independently. This is process-local coordination, not a cross-process filesystem lock; distinct symlink aliases are not canonicalized. HTTP contracts and learning's `/api/cards/next` selection semantics are unchanged.

`projectRoot()` and `flashlearnRoot()` centralize paths. Storage owns file contents, extraction owns traversal, learning owns schedules, and frontend owns HTTP/UI.

## Development and verification

Run the source CLI from the repository root:

```bash
npm run cli -- --help
npm run cli -- generate --project /path/to/repo --subpath src --max-files 20
npm run cli -- start --project /path/to/repo
npm run --silent cli -- project status -o json
```

The root runner builds sibling packages and uses the repository root as cwd. Direct installed CLI invocations use the caller's cwd. Use `--project` explicitly to target another repository.

```bash
npm run test --workspace @flashlearn/cli
npm run typecheck --workspace @flashlearn/cli
```

Sibling package builds/declarations are prerequisites for production integration tests and CLI typechecking. Recording fakes live in `test/fakes/harness.ts`; `contracts.test.ts` checks package handshakes, `pipeline.test.ts` checks orchestration, and `review-concurrency.test.ts` checks transaction ordering and rejection recovery. Run root `npm run check` and `npm run build` for full integration validation.
