# Extraction Workstream

**Owner:** Manasa

Fill in `ExtractionService` in `src/workstream.ts`. Its three methods currently return empty collections so CLI and storage work can proceed before generation is complete.

| Method | Expected behavior |
| --- | --- |
| `scanRepository(root)` | Traverse supported repository files and return relative path, content, and current Git SHA for each document. |
| `generateFromDocument(document)` | Produce attributed questions and answers from one source document. |
| `generateFromRepository(root)` | Scan the repository, generate cards from each document, and return `GeneratedCard[]`. |

Return no IDs, timestamps, learning metadata, or UI data. The existing `QuestionExtractor`, `AnnotationExtractor`, and `generateCards` functions are the baseline seams to evolve or adapt.
