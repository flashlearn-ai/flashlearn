import type { GeneratedCard } from "../../../contracts/index.js";
import type { QuestionExtractor } from "./extractor.js";

type ExtractInput = { path: string; content: string; sha: string };

const MAX_ANSWER_LENGTH = 700;

/**
 * Contributor process docs describe how to work on the repository rather than
 * what the code does, so they are not useful onboarding material.
 */
const META_DOCUMENTS = new Set([
  "agents.md",
  "changelog.md",
  "code_of_conduct.md",
  "contributing.md",
  "license.md",
  "security.md",
]);

function isMetaDocument(path: string): boolean {
  const name = path.toLowerCase().split("/").pop() ?? "";
  return META_DOCUMENTS.has(name) || name.startsWith("claude");
}

/** Truncate on a sentence boundary when possible, falling back to a word boundary. */
function clamp(text: string): string {
  if (text.length <= MAX_ANSWER_LENGTH) return text;

  const window = text.slice(0, MAX_ANSWER_LENGTH);
  const sentenceEnd = Math.max(window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "));
  if (sentenceEnd > MAX_ANSWER_LENGTH * 0.5) return window.slice(0, sentenceEnd + 1);

  const wordEnd = window.lastIndexOf(" ");
  return `${(wordEnd > 0 ? window.slice(0, wordEnd) : window).trimEnd()}…`;
}

/** Collapse whitespace within a single prose paragraph. */
function normalizeAnswer(text: string): string {
  return clamp(text.replace(/\s+/g, " ").trim());
}

/**
 * Join Markdown body lines, keeping list items on their own lines so bullets do
 * not flatten into a single run-on sentence.
 */
function joinBody(lines: string[]): string {
  const parts: string[] = [];
  for (const line of lines) {
    const isItem = /^\s*(?:[-*+]|\d+\.)\s+/.test(line);
    if (isItem || parts.length === 0) {
      parts.push(line.trim());
    } else if (/^\s*(?:[-*+]|\d+\.)\s+/.test(parts[parts.length - 1] ?? "")) {
      parts.push(line.trim());
    } else {
      parts[parts.length - 1] = `${parts[parts.length - 1]} ${line.trim()}`;
    }
  }
  return clamp(parts.map((part) => part.replace(/\s+/g, " ").trim()).join("\n"));
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
    if (isMetaDocument(input.path)) return [];

    const cards: GeneratedCard[] = [];
    const lines = input.content.split(/\r?\n/);
    let heading: string | null = null;
    let body: string[] = [];
    let inFence = false;

    const flush = (): void => {
      const answer = joinBody(body);
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
      // Skip table rows; prose and list items become the answer.
      if (heading && line.trim().length > 0 && !/^\s*\|/.test(line)) {
        body.push(line.trim());
      }
    }
    flush();

    return cards;
  }
}

/**
 * Exported declarations with a preceding JSDoc block become cards. The doc
 * summary is the answer, with tag lines excluded.
 */
export class JsDocExtractor implements QuestionExtractor {
  async extract(input: ExtractInput): Promise<GeneratedCard[]> {
    if (!/\.(ts|tsx|js|jsx)$/i.test(input.path)) return [];

    const cards: GeneratedCard[] = [];
    const pattern =
      /\/\*\*([\s\S]*?)\*\/\s*export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(function|class|const|let|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;

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

/**
 * Exported declarations without a doc comment still describe the shape of the
 * codebase, so they become locator cards that answer where a symbol lives.
 */
export class ExportSignatureExtractor implements QuestionExtractor {
  async extract(input: ExtractInput): Promise<GeneratedCard[]> {
    if (!/\.(ts|tsx|js|jsx)$/i.test(input.path)) return [];

    const documented = new Set<string>();
    const documentedPattern =
      /\/\*\*[\s\S]*?\*\/\s*export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function|class|const|let|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
    for (const match of input.content.matchAll(documentedPattern)) {
      if (match[1]) documented.add(match[1]);
    }

    const cards: GeneratedCard[] = [];
    const pattern =
      /^export\s+(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;

    for (const match of input.content.matchAll(pattern)) {
      const [, kind, name] = match;
      if (!kind || !name || documented.has(name)) continue;

      cards.push({
        question: `Which file defines the \`${name}\` ${kind}?`,
        answer: `\`${name}\` is an exported ${kind} defined in \`${input.path}\`.`,
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
