# CLI Workstream

**Owner:** David

The CLI is the composition root. Fill in `CliService` in `src/workstream.ts` and wire concrete extraction, storage, learning, and frontend implementations there. Each method currently does nothing or returns an empty result so it is safe to implement one method at a time.

| Method | Expected behavior |
| --- | --- |
| `initialize(root)` | Create or validate the `.flashlearn/` project state without replacing existing data. |
| `generate(directory)` | Orchestrate extraction, assign stable card IDs and timestamps, persist cards, and return them. |
| `start(root, options?)` | Compose repositories and learning services, then start the local frontend server. |

Keep extraction, persistence, scheduling, and presentation algorithms in their owning packages.
