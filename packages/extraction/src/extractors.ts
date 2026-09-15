import type { GeneratedCard } from "../../../contracts/index.js";
import type { QuestionExtractor } from "./extractor.js";

type ExtractInput = { path: string; content: string; sha: string };

const MAX_ANSWER_LENGTH = 400;

/** Collapse whitespace and clamp long prose so cards stay readable in the UI. */
function normalizeAnswer(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_ANSWER_LENGTH) return collapsed;
  return `${collapsed.slice(0, MAX_ANSWER_LENGTH - 1).trimEnd()}…`;
}

/** Strip inline Markdown emphasis, links, and code ticks from heading text. */
function plainHeading(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`#]/g, "")
    .trim();
}

/**
 * Markdown headings become cards. The heading is the question subject and the
 * prose directly beneath it, up to the next heading, is the answer.
 */
export class MarkdownExtractor implements QuestionExtractor {
  async extract(input: ExtractInput): Promise<GeneratedCard[]> {
    if (!input.path.toLowerCase().endsWith(".md")) return [];

    const cards: GeneratedCard[] = [];
    const lines = input.content.split(/\r?\n/);
    let heading: string | null = null;
    let body: string[] = [];
    let inFence = false;

    const flush = (): void => {
      const answer = normalizeAnswer(body.join(" "));
      if (heading && answer.length > 0) {
        cards.push({
          question: `What does "${heading}" cover?`,
          answer,
          source: { path: input.path, sha: input.sha },
        });
      }
      body = [];
    };

    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;

      const match = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
      if (match?.[2]) {
        flush();
        heading = plainHeading(match[2]);
        continue;
      }
      // Skip tables, list markers, and annotation lines already owned by AnnotationExtractor.
      if (heading && line.trim().length > 0 && !/^\s*(\||<!--\s*[QA]:)/.test(line)) {
        body.push(line.trim());
      }
    }
    flush();

    return cards;
  }
}

/**
 * Exported functions and classes with a preceding JSDoc block become cards.
 * The first sentence of the doc comment is the answer.
 */
export class JsDocExtractor implements QuestionExtractor {
  async extract(input: ExtractInput): Promise<GeneratedCard[]> {
    if (!/\.(ts|tsx|js|jsx)$/i.test(input.path)) return [];

    const cards: GeneratedCard[] = [];
    const pattern =
      /\/\*\*([\s\S]*?)\*\/\s*export\s+(?:default\s+)?(?:async\s+)?(function|class|const|interface|type)\s+([A-Za-z_$][\w$]*)/g;

    for (const match of input.content.matchAll(pattern)) {
      const [, rawDoc, kind, name] = match;
      if (!rawDoc || !kind || !name) continue;

      const summary = rawDoc
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*\*+/, "").trim())
        .filter((line) => line.length > 0 && !line.startsWith("@"))
        .join(" ");

      const answer = normalizeAnswer(summary);
      if (answer.length === 0) continue;

      const subject = kind === "function" ? `${name}()` : name;
      cards.push({
        question: `What does \`${subject}\` do?`,
        answer,
        source: { path: input.path, sha: input.sha },
      });
    }

    return cards;
  }
}

/** Runs several extractors over one document and concatenates their cards. */
export class CompositeExtractor implements QuestionExtractor {
  private readonly extractors: QuestionExtractor[];

  constructor(...extractors: QuestionExtractor[]) {
    this.extractors = extractors;
  }

  async extract(input: ExtractInput): Promise<GeneratedCard[]> {
    const results = await Promise.all(this.extractors.map(async (extractor) => extractor.extract(input)));
    return results.flat();
  }
}
