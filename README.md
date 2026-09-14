# FlashLearn

FlashLearn turns a Git repository into source-attributed study cards and serves them through a local spaced-repetition experience. It is organized as five independently owned npm workspace packages connected by stable contracts, allowing each workstream to develop and test in parallel.

## Feature Map

This map tracks completion of the agreed owner workstreams, not whether prototype code exists. ✅ means the responsible owner has completed and merged the agreed package implementation. 🚧 means the workstream is still in progress. Starter code, mocks, and baseline implementations do not make a package complete.

1. ✅ **CLI / orchestration** (`packages/cli`) — **David**
   Commands, dependency injection, package wiring, integration fakes, and pipeline tests are implemented. Next: integrate completed owner packages as they merge.

2. 🚧 **Extraction / AI generation** (`packages/extraction`) — **Manasa**
   Starter repository scanning and annotation extraction provide a development baseline. Next: complete repository ingestion and AI-backed question and answer generation.

3. 🚧 **Storage / repositories** (`packages/storage`) — **Sagar**
   Starter JSON repositories demonstrate the locked persistence interfaces. Next: complete and validate the storage package implementation.

4. 🚧 **Learning engine** (`packages/learning`) — **Jenny**
   A baseline scheduler demonstrates review-state updates and due-card selection. Next: complete and validate the agreed spaced-repetition behavior.

5. 🚧 **Frontend / fake Teams** (`packages/frontend`) — **Sara**
   Starter HTTP endpoints and a minimal reveal page demonstrate the integration boundary. Next: complete the fake Teams experience, review controls, and frontend behavior.

Shared infrastructure is ✅ **Done**: the data and HTTP contracts, workspace ownership rules, package-scope enforcement, CI, and local hooks are in place.

## Workstreams

| Workstream | Owner | Package | Responsibilities | May depend on |
| --- | --- | --- | --- | --- |
| **CLI / Project Management Layer** | David | `packages/cli` | `flashlearn init [directory]`, `flashlearn generate [directory]`, `flashlearn start [directory]`, directory selection, orchestration, local web server startup, contracts, and integration between components. | All packages |
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
4. CLI commands: `flashlearn init [directory]`, `flashlearn generate [directory]`, and `flashlearn start [directory] [--host <host>] [--port <port>]`
5. API endpoint names and HTTP payloads

The locked HTTP endpoints are:

```http
GET /api/cards
GET /api/cards/next
GET /api/cards/:id
POST /api/review
```

Once the team agrees on these contracts, contributors should build against package-local mocks and tests. The implementations can then merge through the CLI composition layer with minimal coordination overhead.

### Contract Map

The arrows show which package produces, consumes, implements, or exposes each locked contract. The CLI is the only package that connects concrete implementations; the other packages depend on the shared contract rather than one another.

```mermaid
flowchart LR
  subgraph Packages["Five independently owned packages"]
    CLI["CLI<br/>David<br/><code>packages/cli</code>"]
    Extraction["Extraction<br/>Manasa<br/><code>packages/extraction</code>"]
    Storage["Storage<br/>Sagar<br/><code>packages/storage</code>"]
    Learning["Learning Engine<br/>Jenny<br/><code>packages/learning</code>"]
    Frontend["UI / Fake Teams<br/>Sara<br/><code>packages/frontend</code>"]
  end

  subgraph Models["Locked data models: contracts/index.d.ts"]
    GeneratedCard["GeneratedCard<br/>question: string<br/>answer: string<br/>source.path: string<br/>source.sha: string"]
    Card["Card<br/>id: string<br/>question: string<br/>answer: string<br/>source.path: string<br/>source.sha: string<br/>tags?: string[]<br/>createdAt: string<br/>updatedAt: string"]
    ReviewState["ReviewState<br/>cardId: string<br/>easeFactor: number<br/>intervalDays: number<br/>lastReviewed?: string<br/>nextReview?: string<br/>reviewCount: number<br/>correctCount: number"]
    ReviewResult["ReviewResult<br/>easy | hard | correct | incorrect"]
    CardPreview["CardPreview<br/>id: string<br/>question: string<br/>source.path: string<br/>source.sha: string"]
    ReviewRequest["SubmitReviewRequest<br/>cardId: string<br/>result: ReviewResult"]
  end

  subgraph Ports["Locked repository ports"]
    CardRepo["CardRepository<br/>save(Card): Promise&lt;void&gt;<br/>get(id): Promise&lt;Card | null&gt;<br/>list(): Promise&lt;Card[]&gt;<br/>delete(id): Promise&lt;void&gt;"]
    ReviewRepo["ReviewRepository<br/>get(cardId): Promise&lt;ReviewState&gt;<br/>save(ReviewState): Promise&lt;void&gt;"]
  end

  subgraph HTTP["Locked HTTP boundary: contracts/http.md"]
    Endpoints["GET /api/cards<br/>GET /api/cards/next<br/>GET /api/cards/:id<br/>POST /api/review"]
  end

  Extraction -->|produces| GeneratedCard
  GeneratedCard -->|CLI assigns ID and timestamps| Card
  CLI -->|orchestrates| Extraction
  CLI -->|composes| Storage
  CLI -->|composes| Learning
  CLI -->|starts| Frontend

  Storage -->|implements| CardRepo
  Storage -->|implements| ReviewRepo
  CardRepo -->|persists and returns| Card
  ReviewRepo -->|persists and returns| ReviewState

  Learning -->|consumes| Card
  Learning -->|consumes and updates| ReviewState
  ReviewResult -->|scores review| Learning

  Frontend -->|exposes| Endpoints
  Endpoints -->|list/reveal responses| Card
  Endpoints -->|next response| CardPreview
  ReviewRequest -->|POST body| Endpoints
  Endpoints -->|review response| ReviewState

  classDef package fill:#17251d,color:#fff,stroke:#17251d;
  classDef model fill:#f4f1e8,color:#17251d,stroke:#8b795e;
  classDef port fill:#e6edf5,color:#17251d,stroke:#53708f;
  classDef http fill:#f3e1d1,color:#17251d,stroke:#a55d38;
  class CLI,Extraction,Storage,Learning,Frontend package;
  class GeneratedCard,Card,ReviewState,ReviewResult,CardPreview,ReviewRequest model;
  class CardRepo,ReviewRepo port;
  class Endpoints http;
```

## Locked Contract

`contracts/index.d.ts` locks `Card`, `GeneratedCard`, `ReviewState`, repository ports, and review results. `contracts/http.md` locks endpoint names and payloads. Storage is JSON with these files:

```text
.flashlearn/
  cards.json
  review.json
  settings.json
```

`npm run boundaries` rejects imports between implementation packages. Only the CLI can import package implementations. `CI / Only Edit One Package` rejects a pull request that edits more than one directory under `packages/`; shared root and contract changes do not count as an additional package. `CI / Validate` runs boundaries, typechecks, and tests. `CI / Build` builds the complete workspace and smoke-tests the compiled CLI. Configure the five placeholder teams in `.github/CODEOWNERS`, then enable required code-owner reviews and these CI checks in GitHub branch protection.

## Development

```bash
npm install
npm run check
npm run build
npm run test --workspace @flashlearn/learning
```

Run the development CLI from the repository root:

```bash
npm run dev --workspace @flashlearn/cli -- --help
npm run dev --workspace @flashlearn/cli -- init .
npm run dev --workspace @flashlearn/cli -- generate .
npm run dev --workspace @flashlearn/cli -- start . --host 127.0.0.1 --port 4173
```

The CLI returns exit code `0` for success, `1` for execution failures, and `2` for invalid commands or arguments. See `packages/cli/README.md` for its dependency-injection and integration-test structure.

Husky installs through the root `prepare` script. Pre-commit checks package boundaries and staged whitespace. Pre-push enforces one-package scope, runs all checks, and builds the complete workspace. CI remains authoritative because hooks can be bypassed with `--no-verify`.

The baseline extractor creates cards from adjacent annotations in supported source and Markdown files:

```ts
// Q: What starts the local application?
// A: The flashlearn start command.
```

The `QuestionExtractor` port is the seam for replacing this baseline with an LLM-backed implementation without changing storage or learning code.
