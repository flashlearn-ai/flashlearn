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
flashlearn init /path/to/repository
flashlearn generate /path/to/repository
flashlearn start /path/to/repository
```

Open `http://localhost:4173`. `generate` creates missing storage automatically.
`init` also saves the project for later invocations; `project set` changes it.

```bash
flashlearn project set /path/to/repository
flashlearn project show
flashlearn project status -o json
flashlearn question list -o yaml
flashlearn question get CARD_ID
```

An explicit workflow directory overrides the saved selection.
`FLASHLEARN_PROJECT` overrides saved selection when a directory is omitted.
Project selection is stored in `$XDG_CONFIG_HOME/flashlearn/config.json` or
`~/.config/flashlearn/config.json`. These are the currently merged commands;
run `flashlearn <command> --help` for details.

## Local data and endpoints

Cards, review state, and settings are stored in the project's `.flashlearn/`.
Keep that directory out of version control. The server binds to localhost by
default; use `start --port 4180` for another local port.

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
