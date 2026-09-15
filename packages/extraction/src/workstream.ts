import { readFile } from "node:fs/promises";
import type { GeneratedCard } from "../../../contracts/index.js";
import {
  fileSha,
  headSha,
  sourceFiles,
  toRepositoryPath,
  type QuestionExtractor,
} from "./extractor.js";
import {
  CompositeExtractor,
  ExportSignatureExtractor,
  GoDocExtractor,
  JsDocExtractor,
  MarkdownExtractor,
} from "./extractors.js";
import { EndpointExtractor, endpointConfigFromEnv } from "./endpoint.js";

/** Bounded in-flight work per repository run. */
const DEFAULT_CONCURRENCY = 8;

/** Deterministic default: code declarations first, then Markdown prose. */
export function deterministicExtractor(): QuestionExtractor {
  return new CompositeExtractor(
    new JsDocExtractor(),
    new GoDocExtractor(),
    new ExportSignatureExtractor(),
    new MarkdownExtractor(),
  );
}

/**
 * Uses the configured endpoint for code files when one is set, keeping the
 * deterministic Markdown extractor either way. Falls back to the fully
 * deterministic baseline so runs work offline and without credentials.
 */
export function defaultExtractor(): QuestionExtractor {
  const config = endpointConfigFromEnv();
  if (!config) return deterministicExtractor();
  return new CompositeExtractor(new EndpointExtractor(config), new MarkdownExtractor());
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
 * Run a task per item with a bounded number in flight. Repository-wide
 * generation would otherwise open one request per file against an endpoint.
 */
async function mapWithConcurrency<Item, Result>(
  items: Item[],
  limit: number,
  task: (item: Item) => Promise<Result>,
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) results[index] = await task(item);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Manasa's workstream. Produces attributed `GeneratedCard[]` only — no IDs,
 * timestamps, or review metadata. The CLI assigns those downstream.
 */
export class ExtractionService implements ExtractionWorkstream {
  constructor(
    private readonly extractor: QuestionExtractor = defaultExtractor(),
    private readonly concurrency: number = DEFAULT_CONCURRENCY,
  ) {}

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
    const generated = await mapWithConcurrency(documents, this.concurrency, async (document) =>
      this.generateFromDocument(document),
    );
    return generated.flat();
  }
}

/** Repository-wide generation entry point used by the CLI. */
export async function generateCards(
  root: string,
  extractor: QuestionExtractor = defaultExtractor(),
): Promise<GeneratedCard[]> {
  return new ExtractionService(extractor).generateFromRepository(root);
}
