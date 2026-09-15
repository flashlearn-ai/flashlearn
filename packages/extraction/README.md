# Extraction Workstream

**Owner:** Manasa

Fill in `ExtractionService` in `src/workstream.ts`. Its three methods currently return empty collections so CLI and storage work can proceed before generation is complete.

| Method | Expected behavior |
| --- | --- |
| `scanRepository(root)` | Traverse supported repository files and return relative path, content, and current Git SHA for each document. |
| `generateFromDocument(document)` | Produce attributed questions and answers from one source document. |
| `generateFromRepository(root)` | Scan the repository, generate cards from each document, and return `GeneratedCard[]`. |

Return no IDs, timestamps, learning metadata, or UI data. `QuestionExtractor` is the seam every extractor implements. `MarkdownExtractor` and `JsDocExtractor` are the deterministic baseline, combined by `CompositeExtractor` in `defaultExtractor()`. An AI-backed extractor slots into the same seam without changing storage or learning code.
