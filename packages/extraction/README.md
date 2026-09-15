# Extraction Workstream

**Owner:** Manasa

Fill in `ExtractionService` in `src/workstream.ts`. Its three methods currently return empty collections so CLI and storage work can proceed before generation is complete.

| Method | Expected behavior |
| --- | --- |
| `scanRepository(root)` | Traverse supported repository files and return relative path, content, and current Git SHA for each document. |
| `generateFromDocument(document)` | Produce attributed questions and answers from one source document. |
| `generateFromRepository(root)` | Scan the repository, generate cards from each document, and return `GeneratedCard[]`. |

Return no IDs, timestamps, learning metadata, or UI data. `QuestionExtractor` is the seam every extractor implements. `MarkdownExtractor`, `JsDocExtractor`, `GoDocExtractor`, and `ExportSignatureExtractor` are the deterministic baseline, combined by `CompositeExtractor` in `defaultExtractor()`. An AI-backed extractor slots into the same seam without changing storage or learning code.

Supported sources are `.go`, `.js`, `.jsx`, `.md`, `.ts`, and `.tsx`. Go doc comments on exported declarations become cards; `_test.go` files and unexported identifiers are skipped. Traversal ignores `vendor/`, `testdata/`, `third_party/`, and `_output/` alongside the usual generated and dependency directories.

## Corpus reporting

Unit tests cover extractor behavior on fixtures; they do not show what a real repository produces. `summarizeCards` reports card counts by extension, the files generating the most cards, answer-length distribution, and repeated questions.

```bash
npm run report --workspace @flashlearn/extraction -- /path/to/repo
```

`npm run --workspace` sets the working directory to this package, so pass an absolute path. Capture this before and after an extraction change and include both in the pull request.
