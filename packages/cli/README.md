# CLI Workstream

**Owner:** David

The CLI is the composition root. `CliService` in `src/workstream.ts` owns orchestration, `runCli` in `src/cli.ts` owns command parsing and exit codes, and `src/production.ts` adapts the four package implementations to CLI-owned dependency interfaces.

| Method | Expected behavior |
| --- | --- |
| `initialize(root)` | Create or validate `.flashlearn/` without replacing data, then select it as the active project. |
| `generate(directory)` | Orchestrate extraction, assign stable card IDs and timestamps, persist cards, and return them. |
| `start(root, options?)` | Compose repositories and learning services, then start the local frontend server. |
| `setProject(directory)` | Validate and save the default project directory. |
| `getCard(id, directory?)` | Read one card from the selected project's `.flashlearn/cards.json`. |
| `listCards(directory?)` | Read all cards from the selected project. |
| `status(directory?)` | Summarize cards, reviewed cards, unreviewed cards, and cards due now. |

Keep extraction, persistence, scheduling, and presentation algorithms in their owning packages.

`projectRoot(input)` centralizes absolute project path resolution. `flashlearnRoot(input)` derives the project's `.flashlearn/` directory. The CLI passes the project root to storage; storage owns creating and persisting the directory contents.

Run the source CLI from the repository root:

```bash
npm run cli -- --help
npm run cli -- init .
npm run cli -- generate .
npm run cli -- start . --port 4173
```

The root script preserves the repository root as the current directory and builds sibling package declarations before starting the source CLI.

Select a project once, then query its `.flashlearn/` data from any directory:

```bash
flashlearn project set /path/to/repository
flashlearn project show
flashlearn project status
flashlearn question list
flashlearn question get CARD_ID
```

`set-project` stores `FLASHLEARN_PROJECT` in `${XDG_CONFIG_HOME:-~/.config}/flashlearn/config.json`. A real `FLASHLEARN_PROJECT` environment variable overrides the saved value. The CLI cannot modify its parent shell environment, so it also sets the variable only for its current process.

`init [directory]` also selects the initialized directory. Subsequent commands can omit the project path.

Query commands default to readable text and support structured output:

```bash
flashlearn project show -o yaml
flashlearn project status -o json
flashlearn question list --output yaml
flashlearn question get CARD_ID -o json
```

Accepted formats are `text`, `json`, and `yaml`.

The local server binds to `localhost` by default. Wildcard addresses such as `0.0.0.0` and `::` are rejected to avoid exposing the learning server beyond the local machine.

Tests use in-memory repositories and recording package fakes from `test/fakes/harness.ts`. `contracts.test.ts` validates each package handshake, while `pipeline.test.ts` exercises extraction through frontend service composition without disk or network access.

Successful commands guide first-time users through the setup flow. A blank line separates the result from a shell-comment explanation and the copyable next action, so both lines can be pasted safely:

```text
init -> generate -> start -> open the local URL
```

Suggested commands include the resolved project directory and quote it so paths containing spaces remain usable in a shell.
