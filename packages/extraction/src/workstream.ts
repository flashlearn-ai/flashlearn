import { readFile } from "node:fs/promises";
import { join, sep } from "node:path";
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
import { validateCards, type ValidationResult } from "./validator.js";

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

/**
 * Narrows a run. Large repositories hold far more files than one deck should
 * cover, and an endpoint-backed run issues one request per file, so a scoped
 * run is the normal way to use this against something Kubernetes-sized.
 */
export type GenerateOptions = {
  /** Repository-relative directory to restrict the run to, for example `pkg/kubelet`. */
  subpath?: string;
  /** Upper bound on files scanned, guarding against an accidental repository-wide run. */
  maxFiles?: number;
};

/** Normalize a subpath to repository-relative POSIX form, rejecting escapes. */
function normalizeSubpath(subpath: string): string {
  const cleaned = subpath.split(sep).join("/").replace(/^\.\//, "").replace(/^\/+|\/+$/g, "");
  if (cleaned.length === 0) return "";
  if (cleaned === ".." || cleaned.startsWith("../") || cleaned.includes("/../")) {
    throw new Error(`Subpath must stay inside the repository: ${subpath}`);
  }
  return cleaned;
}

/** Repository ingestion and generation operations owned by extraction. */
export interface ExtractionWorkstream {
  scanRepository(root: string, options?: GenerateOptions): Promise<SourceDocument[]>;
  generateFromDocument(document: SourceDocument): Promise<GeneratedCard[]>;
  generateFromRepository(root: string, options?: GenerateOptions): Promise<GeneratedCard[]>;
  generateWithRejections(root: string, options?: GenerateOptions): Promise<ValidationResult>;
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

  /**
   * Scans the repository, optionally restricted to a subpath. The root stays
   * the repository root even when scoped, so Git attribution keeps resolving
   * and `source.path` remains repository-relative.
   */
  async scanRepository(root: string, options: GenerateOptions = {}): Promise<SourceDocument[]> {
    const commitSha = await headSha(root);
    const subpath = options.subpath ? normalizeSubpath(options.subpath) : "";

    let files = await sourceFiles(root, subpath ? join(root, subpath) : root);
    files.sort((left, right) => left.localeCompare(right));
    if (options.maxFiles !== undefined) files = files.slice(0, Math.max(0, options.maxFiles));

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

  /**
   * Generates cards for one document. Per-document validation cannot see
   * repeats across files, so cross-file deduplication happens in
   * `generateFromRepository`.
   */
  async generateFromDocument(document: SourceDocument): Promise<GeneratedCard[]> {
    const cards = await this.extractor.extract(document);
    return validateCards(usableCards(cards)).cards;
  }

  async generateFromRepository(root: string, options: GenerateOptions = {}): Promise<GeneratedCard[]> {
    return (await this.generateWithRejections(root, options)).cards;
  }

  /**
   * Repository-wide generation that also reports what validation filtered.
   * The corpus report uses this to show why a run shrank.
   */
  async generateWithRejections(root: string, options: GenerateOptions = {}): Promise<ValidationResult> {
    const documents = await this.scanRepository(root, options);
    const generated = await mapWithConcurrency(documents, this.concurrency, async (document) =>
      usableCards(await this.extractor.extract(document)),
    );
    return validateCards(generated.flat());
  }
}

/** Repository-wide generation entry point used by the CLI. */
export async function generateCards(
  root: string,
  extractor: QuestionExtractor = defaultExtractor(),
  options: GenerateOptions = {},
): Promise<GeneratedCard[]> {
  return new ExtractionService(extractor).generateFromRepository(root, options);
}
