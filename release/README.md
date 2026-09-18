# FlashLearn

Agentic AI for compounding learning velocity. Turn unfamiliar repositories into
source-attributed study cards and review them in a local Teams-style interface.

## Install

Requires Node.js 22.14+ and Git on PATH for Git attribution.

```bash
npm install --global flashlearn@next
flashlearn --help
flashlearn --version
```

Or run without a global installation: `npx flashlearn@next --help`.
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
limiting supported files scanned, not cards. Both flags belong to `generate`
only; run it before `start` to scope first-run generation. By default generation
scans the whole project with no file limit. Attribution stays relative to the
project root.

Generation reports new or updated cards and the total available for study. It
upserts without pruning existing cards outside the scan. Producing zero cards
can succeed if a previous deck remains; no available study cards means exit 1.
Exit codes are 0 for success, 1 for operation failure, and 2 for invalid arguments.

## Local data and endpoints

Cards, review state, and settings are stored in the project's `.flashlearn/`.
Keep that directory out of version control. The server binds to localhost by
default on port 4173; use `start --host <host> --port 4180` to override the bind
address and port. Wildcard hosts `0.0.0.0` and `::` are rejected.

Without endpoint configuration, generation uses deterministic source/documentation
extractors. Setting both `FLASHLEARN_ENDPOINT_URL` and `FLASHLEARN_ENDPOINT_MODEL`
enables a chat-completions endpoint. Code is sent to that configured endpoint;
its access controls and retention policy are separate from local repository
permissions. Keep endpoint credentials out of Git and public demo builds.

The GitHub Pages showcase uses only public hand-authored samples. It does not read
your project, contact an API, or persist ratings across reloads.

## Upgrade and support

```bash
npm install --global flashlearn@next
```

Report reproducible issues at https://github.com/flashlearn-ai/flashlearn/issues
with the CLI version and Node version. Do not attach private source, generated
decks, or credentials. MIT licensed; see LICENSE and THIRD_PARTY_NOTICES.txt.
