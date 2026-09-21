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

When no endpoint environment variables are configured, an interactive generation run checks whether `copilot` is on `PATH` and asks before using `copilot -p`. If Copilot is declined or unavailable, provider setup offers OpenAI, Claude, a custom OpenAI-compatible endpoint, or deterministic extraction. Prompted API keys live only for the current command and are not written to `.flashlearn/`. Non-interactive runs clearly fall back to deterministic extraction. Any AI choice sends supported source files to that provider.

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

Copilot, OpenAI-compatible endpoints, and Claude use the same curriculum prompt for **both code and Markdown**. Up to eight parallel batches (four files each, with a dedicated README batch when present) request at most ten candidates each. Excerpts preserve complete sections/declarations where practical within 7,000 characters per file. Each call has a 45-second timeout; Copilot processes are killed on timeout. Calls may fail or yield no accepted cards, and are reported rather than hidden with filler.

Each AI candidate must include a learning objective and a verbatim evidence quote from its cited excerpt. Quotes from another file or invented IDs are rejected; path and SHA are assigned locally. Evidence matching establishes textual support, **not semantic proof of the whole answer**. Documentation-derived questions name their document; documents marked aspirational get an explicit design-status qualification. Stale documentation and model errors still warrant human review.

Quality checks reject vague helper/heading questions, constants/locator trivia, incomplete or truncated answers, and detectable list-count mismatches. Ranked candidates favor architectural foundations and reasoning; token-overlap/concept heuristics remove near-duplicate questions/answers and cap dominance at eight cards per file and 25 per subsystem. These are heuristics, not perfect semantic deduplication. **100 is a maximum, not a target: no deterministic filler is added in AI mode.** Offline deterministic mode uses the same source selection and ranking on up to 80 important files, with explicitly labeled section/doc-comment recall.

This is bounded coverage, not exhaustive analysis. The one-minute target depends on scanning, provider latency, and storage; it is not a universal SLA.

### Generation benchmark

After `npm run build`, run:

```bash
node packages/cli/scripts/benchmark-generation.mjs /path/to/repo auto
```

The benchmark clones committed source into a temporary directory, runs the compiled CLI from process launch through persistence, reports elapsed time/card counts, and removes the clone. Add `--keep` after the model to retain the deck for local review. It excludes clone/build time and preserves the original repository's deck. It exits nonzero for a failed run, zero cards, over 100 cards, or elapsed time of at least 60 seconds.

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
