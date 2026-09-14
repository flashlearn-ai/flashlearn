# FlashLearn

FlashLearn is organized as exactly five independently owned npm workspace packages. Stable types in `contracts/` are the only shared source surface. The CLI is the composition root; all other packages are isolated and communicate through injected contract interfaces.

## Workstreams

| Workstream | Owner | Package | Responsibilities | May depend on |
| --- | --- | --- | --- | --- |
| **CLI / Project Management Layer** | David | `packages/cli` | `flashlearn init`, `flashlearn generate`, `flashlearn start`, directory selection, orchestration, local web server startup, contracts, and integration between components. | All packages |
| **Question Extraction / AI Generation** | Manasa | `packages/extraction` | Repository ingestion and scanning, knowledge extraction, question generation, answer generation, and source attribution (`path`, `sha`). | Contracts only |
| **Storage / Repository Layer** | Sagar | `packages/storage` | Card persistence, retrieval APIs, local JSON storage format, and repository abstractions. | Contracts only |
| **Learning Engine / Spaced Repetition** | Jenny | `packages/learning` | Review scheduling, spaced repetition logic, card selection, and easy/hard/correct/incorrect scoring. | Contracts only |
| **UI / Fake Teams Experience** | Sara | `packages/frontend` | Card display, answer reveal, review actions, HTTP handlers, and the fake Teams browser experience. | Contracts only |

David's directory responsibility is selecting the input directory and passing it into the pipeline. Manasa owns traversing and interpreting that repository inside the extraction package. David starts the local server through orchestration; Sara owns the server's HTTP handlers and UI behavior inside the frontend package.

Each contributor should change only their assigned `packages/<name>/` directory. Package tests and implementation stay together. Changes to `contracts/`, root configuration, or integration wiring require review from all affected owners.

## Workstream Interfaces

The end-to-end handoff is:

```text
David (CLI / orchestration)
  -> Manasa (question generation)
  -> Sagar (card storage)
  -> Jenny (learning engine)
  -> Sara (UI / fake Teams experience)
```

The flow describes data handoffs, not implementation imports. Only `packages/cli` composes concrete package implementations. Every other package works against types and interfaces in `contracts/`, allowing each owner to develop and test independently with mocks.

David is responsible for defining and coordinating agreement on these contracts before implementation changes cross package boundaries:

1. `Card` and `GeneratedCard`
2. `ReviewState` and review result values
3. `CardRepository` and `ReviewRepository`
4. CLI commands: `flashlearn init`, `flashlearn generate <directory>`, and `flashlearn start`
5. API endpoint names and HTTP payloads

The locked HTTP endpoints are:

```http
GET /api/cards
GET /api/cards/next
GET /api/cards/:id
POST /api/review
```

Once the team agrees on these contracts, contributors should build against package-local mocks and tests. The implementations can then merge through the CLI composition layer with minimal coordination overhead.

## Locked Contract

`contracts/index.d.ts` locks `Card`, `GeneratedCard`, `ReviewState`, repository ports, and review results. `contracts/http.md` locks endpoint names and payloads. Storage is JSON with these files:

```text
.flashlearn/
  cards.json
  review.json
  settings.json
```

`npm run boundaries` rejects imports between implementation packages. Only the CLI can import package implementations. Configure the five placeholder teams in `.github/CODEOWNERS`, then enable required code-owner reviews and the CI check in GitHub branch protection.

## Development

```bash
npm install
npm run check
npm run build
npm run test --workspace @flashlearn/learning
```

Run the development CLI from the repository root:

```bash
npx tsx packages/cli/src/index.ts init
npx tsx packages/cli/src/index.ts generate .
npx tsx packages/cli/src/index.ts start
```

The baseline extractor creates cards from adjacent annotations in supported source and Markdown files:

```ts
// Q: What starts the local application?
// A: The flashlearn start command.
```

The `QuestionExtractor` port is the seam for replacing this baseline with an LLM-backed implementation without changing storage or learning code.
