# CLI Workstream

**Owner:** David

The CLI is the composition root. `CliService` in `src/workstream.ts` owns orchestration, `runCli` in `src/cli.ts` owns command parsing and exit codes, and `src/production.ts` adapts the four package implementations to CLI-owned dependency interfaces.

| Method | Expected behavior |
| --- | --- |
| `initialize(root)` | Create or validate the `.flashlearn/` project state without replacing existing data. |
| `generate(directory)` | Orchestrate extraction, assign stable card IDs and timestamps, persist cards, and return them. |
| `start(root, options?)` | Compose repositories and learning services, then start the local frontend server. |

Keep extraction, persistence, scheduling, and presentation algorithms in their owning packages.

Run the source CLI from the repository root:

```bash
npm run dev --workspace @flashlearn/cli -- --help
npm run dev --workspace @flashlearn/cli -- init .
npm run dev --workspace @flashlearn/cli -- generate .
npm run dev --workspace @flashlearn/cli -- start . --port 4173
```

The local server binds to `localhost` by default. Wildcard addresses such as `0.0.0.0` and `::` are rejected to avoid exposing the learning server beyond the local machine.

Tests use in-memory repositories and recording package fakes from `test/fakes/harness.ts`. `contracts.test.ts` validates each package handshake, while `pipeline.test.ts` exercises extraction through frontend service composition without disk or network access.

Successful commands guide first-time users through the setup flow. A blank line separates the result from a shell-comment explanation and the copyable next action, so both lines can be pasted safely:

```text
init -> generate -> start -> open the local URL
```

Suggested commands include the resolved project directory and quote it so paths containing spaces remain usable in a shell.
