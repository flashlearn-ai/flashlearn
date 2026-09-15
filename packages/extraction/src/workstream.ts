import { readFile } from "node:fs/promises";
import type { GeneratedCard } from "../../../contracts/index.js";
import {
  AnnotationExtractor,
  fileSha,
  headSha,
  sourceFiles,
  toRepositoryPath,
  type QuestionExtractor,
} from "./extractor.js";
import { CompositeExtractor, JsDocExtractor, MarkdownExtractor } from "./extractors.js";

/** Deterministic default: annotations, Markdown headings, and JSDoc summaries. */
export function defaultExtractor(): QuestionExtractor {
  return new CompositeExtractor(new AnnotationExtractor(), new MarkdownExtractor(), new JsDocExtractor());
}

export type SourceDocument = {
  path: string;
  content: string;
  sha: string;
};

/** Repository ingestion and generation operations owned by extraction. */
export interface ExtractionWorkstream {
  scanRepository(root: string): Promise<SourceDocument[]>;
  generateFromDocument(document: SourceDocument): Promise<GeneratedCard[]>;
  generateFromRepository(root: string): Promise<GeneratedCard[]>;
}

/** Skip empty or whitespace-only questions and answers, and drop duplicates. */
function usableCards(cards: GeneratedCard[]): GeneratedCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (card.question.trim().length === 0 || card.answer.trim().length === 0) return false;
    const key = `${card.source.path}::${card.question.trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Manasa's workstream. Produces attributed `GeneratedCard[]` only — no IDs,
 * timestamps, or review metadata. The CLI assigns those downstream.
 */
export class ExtractionService implements ExtractionWorkstream {
  constructor(private readonly extractor: QuestionExtractor = defaultExtractor()) {}

  async scanRepository(root: string): Promise<SourceDocument[]> {
    const commitSha = await headSha(root);
    const files = await sourceFiles(root);
    const documents = await Promise.all(
      files.map(async (absolutePath) => {
        const path = toRepositoryPath(root, absolutePath);
        const [content, sha] = await Promise.all([
          readFile(absolutePath, "utf8"),
          fileSha(root, path, commitSha),
        ]);
        return { path, content, sha } satisfies SourceDocument;
      }),
    );
    return documents.sort((left, right) => left.path.localeCompare(right.path));
  }

  async generateFromDocument(document: SourceDocument): Promise<GeneratedCard[]> {
    const cards = await this.extractor.extract(document);
    return usableCards(cards);
  }

  async generateFromRepository(root: string): Promise<GeneratedCard[]> {
    const documents = await this.scanRepository(root);
    const generated = await Promise.all(documents.map(async (document) => this.generateFromDocument(document)));
    return generated.flat();
  }
}
