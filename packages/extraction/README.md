# Extraction

Repository scanning, source extraction, and attributed card generation.

`ExtractionService` in `src/workstream.ts` scans supported files, runs injected extractors, and validates attributed cards. The CLI composes its public APIs with the generation pipeline described in the [CLI README](../cli/README.md).

| Method | Expected behavior |
| --- | --- |
| `scanRepository(root)` | Traverse supported repository files and return relative path, content, and current Git SHA for each document. |
| `generateFromDocument(document)` | Produce attributed questions and answers from one source document. |
| `generateFromRepository(root)` | Scan the repository, generate cards from each document, and return `GeneratedCard[]`. |

Return no IDs, timestamps, learning metadata, or UI data. `QuestionExtractor` is the seam every extractor implements. `MarkdownExtractor`, `JsDocExtractor`, `GoDocExtractor`, and `ExportSignatureExtractor` are the deterministic baseline, combined by `CompositeExtractor` in `defaultExtractor()`. An AI-backed extractor slots into the same seam without changing storage or learning code.

Supported sources are `.go`, `.js`, `.jsx`, `.md`, `.ts`, and `.tsx`. Go doc comments on exported declarations become cards; `_test.go` files and unexported identifiers are skipped. Traversal ignores `vendor/`, `testdata/`, `third_party/`, and `_output/` alongside the usual generated and dependency directories.

## Scale: generated files and scoped runs

A repository the size of Kubernetes needs filtering and scoping before it produces a deck anyone would study.

Traversal skips machine-generated sources entirely, because generated code describes a generator's output rather than intent. Two signals are used: filenames (`zz_generated*`, `*.pb.go`, `*_generated.go`, `bindata.go`) and Go's canonical `// Code generated ... DO NOT EDIT.` marker. The marker check reads only the first 2 KB, so a multi-megabyte generated file is never read in full just to reject it. `_test.go` files and `CHANGELOG*.md` are skipped during traversal too — every extractor already discarded them, so reading them was wasted I/O.

Filtering happens in traversal rather than inside each extractor, so the endpoint path benefits as much as the deterministic one.

`GenerateOptions` narrows a run:

| Option | Purpose |
| --- | --- |
| `subpath` | Repository-relative directory to restrict the run to, for example `pkg/kubelet` |
| `maxFiles` | Upper bound on files scanned, guarding against an accidental repository-wide run |

The root stays the repository root even when scoped, so Git attribution keeps resolving and `source.path` remains repository-relative. Pointing the root at the subdirectory instead would break `git rev-parse HEAD:<path>` and silently degrade every SHA to the commit fallback.

Scoping matters most for endpoint-backed runs, which issue one request per file. On Kubernetes that is the difference between roughly 13,000 requests and roughly 300.

## Card validation

Filtering decides which files are read; validation decides which cards survive. Extractors build cards from whatever a file happens to contain, so a run produces some cards that would waste a reviewer's time. `validateCards()` enforces five rules:

| Rule | Rejects |
| --- | --- |
| `locator` | "Which file defines the ... ?" — filesystem trivia, not understanding |
| `shortAnswer` | Answers under 25 characters, too thin to teach anything |
| `restatement` | Answers whose content words mostly repeat the question |
| `danglingContext` | Answers opening with `this`, `it`, `the following`, `see above`, and similar references to text the card does not carry |
| duplicate question | The same question generated from more than one file |

The restatement check splits camelCase identifiers and strips common suffixes, so `AllocationManager` restated as "manages allocation" is caught. The threshold is 60% shared content words.

Deduplication is repository-wide and therefore runs after every document is extracted; per-file deduplication cannot see a helper documented identically in several packages.

Every rejected card is returned with a reason. `generateWithRejections()` exposes them and the corpus report prints a breakdown, so filtering is never silent:

```text
Filtered by validation: 212
     141  locator question
      54  duplicate question across files
      17  answer restates the question
```

## Endpoint-backed generation

Deterministic extractors can only reformat documentation a human already wrote. `EndpointExtractor` sends each code file to a chat-completions endpoint so undocumented code still produces questions.

Configure it with environment variables. When either the URL or the model is unset, `defaultExtractor()` falls back to the deterministic baseline, so offline runs and runs without credentials keep working.

| Variable | Required | Purpose |
| --- | --- | --- |
| `FLASHLEARN_ENDPOINT_URL` | yes | Chat-completions URL |
| `FLASHLEARN_ENDPOINT_MODEL` | yes | Model or deployment name |
| `FLASHLEARN_ENDPOINT_API_KEY` | no | Sent as `Authorization: Bearer <key>` by default |
| `FLASHLEARN_ENDPOINT_AUTH_HEADER` | no | Header name for the key; use `api-key` for Azure OpenAI |

Markdown stays deterministic even when an endpoint is configured, because prose under a heading is already an answer.

Attribution is stamped from the real path and SHA rather than the model reply, so a hallucinated source cannot enter the card set. A file whose request fails or times out yields no cards instead of aborting the run, and repository-wide generation bounds how many requests are in flight.

Do not commit credentials. `.gitignore` already covers `.env*`.

## Corpus reporting

Unit tests cover extractor behavior on fixtures; they do not show what a real repository produces. `summarizeCards` reports card counts by extension, the files generating the most cards, answer-length distribution, and repeated questions.

```bash
npm run report --workspace @flashlearn/extraction -- /path/to/repo [subpath]
```

`npm run --workspace` sets the working directory to this package, so pass an absolute path. Capture this before and after an extraction change and include both in the pull request.

Measured on a shallow `kubernetes/kubernetes` clone:

| Run | Cards | Files | Time |
| --- | --- | --- | --- |
| Whole repo, before filtering | 35,183 | 7,272 | 5m32s |
| Whole repo, after filtering | 20,110 | 4,617 | 2m02s |
| `pkg/kubelet` only | 955 | 306 | 4s |

Before filtering, every top source was machine-generated (`zz_generated.conversion.go` alone produced 495 cards). After, the top sources are hand-written API types.
