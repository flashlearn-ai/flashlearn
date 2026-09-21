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

```bash
flashlearn generate --project /path/to/repo --subpath src --max-files 20
```

- `--subpath <directory>` restricts extraction to a repository-relative directory. Default: the whole project. Absolute paths and `..` segments are argument errors. Individual file subpaths are not supported by the existing extraction scanner.
- `--max-files <number>` limits scanned supported files, not generated cards. It must be a positive safe integer; default: no limit. Extraction determines ordering and ignored sources.
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

The CLI always passes its resolved invocation directory explicitly. `GenerateOptions` (`subpath`, `maxFiles`) is carried through the CLI-owned dependency seam; production adapts it to extraction's existing options argument. `CliIO.confirm` provides injectable startup confirmation; `src/confirm.ts` implements terminal prompting.

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
