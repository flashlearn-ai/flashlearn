<p align="center">
  <img src="flashlearn%20icon.png" alt="FlashLearn" width="128" height="121">
</p>

<h1 align="center">FlashLearn</h1>

<p align="center"><strong>Learn a codebase. Keep what you learn.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/@flashlearnai/cli"><img src="https://img.shields.io/npm/v/%40flashlearnai%2Fcli?label=npm" alt="npm version"></a>
  <a href="https://github.com/flashlearn-ai/flashlearn/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://github.com/flashlearn-ai/flashlearn/actions/workflows/ci.yml/badge.svg?branch=main&amp;event=push" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license"></a>
</p>

Turn repository code and documentation into source-attributed study cards. Review in your terminal or browser, with spaced repetition to make unfamiliar concepts stick.

```bash
npm i -g @flashlearnai/cli
```

[Documentation](https://flashlearn-ai.github.io/flashlearn/docs/) · [Try the demo](https://flashlearn-ai.github.io/flashlearn/demo/) · [Contributing](CONTRIBUTING.md)

## Quickstart

Requires **Node.js 22.14+** and Git for commit attribution. From the project you want to learn:

```bash
flashlearn generate
flashlearn review
```

1. **Generate:** choose Copilot, OpenAI, Claude, a custom endpoint, or the offline heuristic. Storage is created automatically.
2. **Review:** pick a numbered answer in the terminal. Results save automatically; Enter continues and Q quits. Sessions cover up to 12 reviews and need at least two distinct deck answers.

Prefer a browser? Run `flashlearn start` and open **http://localhost:4173**. It uses the same saved review schedule.

Target another folder with `--project /path/to/repo`. For a large codebase, start small:

```bash
flashlearn generate --project /path/to/repo --subpath src --max-files 20
flashlearn review --project /path/to/repo
```

## Why FlashLearn?

- **Build project context:** study concepts, responsibilities, and decisions drawn from existing code and docs.
- **Trace answers to source:** cards cite a file and Git commit when available, so you can check what you learn.
- **Fit learning into work:** use multiple-choice terminal reviews or the browser's topic and due-card sessions.
- **Keep your progress:** cards and review schedules live in the project's `.flashlearn/` directory. AI generation checkpoints let interrupted runs resume.
- **Choose your inference:** use an AI provider for richer questions, or stay offline with extractive recall from source prose.

Supports Markdown, JavaScript/JSX, TypeScript/TSX, and Go. Each generation run adds or updates up to 100 cards without deleting your existing deck.

## Architecture

```text
Code + docs → extraction → attributed cards → local storage
                                                   ↕
Terminal / browser ← due cards + feedback ← learning engine
```

The **CLI** composes five TypeScript packages: [extraction](packages/extraction), [storage](packages/storage), [learning](packages/learning), [frontend](packages/frontend), and [CLI orchestration](packages/cli). Shared [data](contracts/index.d.ts) and [HTTP](contracts/http.md) contracts keep generation, persistence, scheduling, and presentation independent.

See [Contributing](CONTRIBUTING.md) for development setup and package boundaries, or the [CLI reference](packages/cli/README.md) for configuration and commands.

## Local-first, with clear boundaries

Offline generation and review run locally. Selecting an AI provider sends selected code and documentation to that provider; prompted API keys are used only for the current run. Browser topic-insights history is device-local in `localStorage`, separate from the saved review schedule.

Generated answers can be imperfect or reflect stale documentation—use their citations to verify them. The public demo uses sample cards only. Wiki connectors and native Teams, GitHub, and Slack delivery are planned, not installed integrations.

## Contribute

Ideas, bug reports, documentation improvements, and code contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md) or [open an issue](https://github.com/flashlearn-ai/flashlearn/issues).

[MIT licensed](LICENSE).
