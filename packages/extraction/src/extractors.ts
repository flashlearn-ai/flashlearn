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

/**
 * Repository process directories. Everything under `.github/` is contributor
 * workflow — pull request templates, issue forms, workflow definitions — and
 * describes how to contribute rather than what the system does.
 */
const META_DIRECTORIES = ["/.github/", "/docs/devel/"];

function isMetaDocument(path: string): boolean {
  const lower = path.toLowerCase();
  if (META_DIRECTORIES.some((directory) => `/${lower}`.includes(directory))) return true;

  const name = lower.split("/").pop() ?? "";
  return META_DOCUMENTS.has(name) || name.startsWith("claude") || name.startsWith("pull_request_template") || name.startsWith("issue_template");
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

type GoDeclaration = { kind: string; name: string };

/** Go test files document the tests, not the package, so they are skipped. */
function isGoSource(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".go") && !lower.endsWith("_test.go");
}

/**
 * Match an exported top-level Go declaration. Only capitalized identifiers are
 * exported in Go, and methods with a receiver are skipped so cards describe the
 * package surface rather than every method on every type.
 */
function goDeclaration(line: string): GoDeclaration | null {
  const match = /^(func|type|const|var)\s+([A-Z][\w]*)/.exec(line);
  if (!match?.[1] || !match[2]) return null;
  return { kind: match[1], name: match[2] };
}

function goSubject(declaration: GoDeclaration): string {
  return declaration.kind === "func" ? `${declaration.name}()` : declaration.name;
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
 * Exported Go declarations with a preceding doc comment become cards. Go doc
 * comments are consecutive `//` lines immediately above the declaration and
 * conventionally open with the identifier name.
 */
export class GoDocExtractor implements QuestionExtractor {
  async extract(input: ExtractInput): Promise<GeneratedCard[]> {
    if (!isGoSource(input.path)) return [];

    const cards: GeneratedCard[] = [];
    const lines = input.content.split(/\r?\n/);
    let comment: string[] = [];

    for (const line of lines) {
      const commentMatch = /^\s*\/\/\s?(.*)$/.exec(line);
      if (commentMatch) {
        comment.push((commentMatch[1] ?? "").trim());
        continue;
      }

      const declaration = goDeclaration(line);
      if (declaration && comment.length > 0) {
        const answer = normalizeAnswer(comment.join(" "));
        if (answer.length > 0) {
          cards.push({
            question: `What does \`${goSubject(declaration)}\` do?`,
            answer,
            source: { path: input.path, sha: input.sha },
          });
        }
      }
      comment = [];
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
    if (isGoSource(input.path)) return this.extractGo(input);
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

  /** Exported Go declarations with no preceding doc comment become locator cards. */
  private async extractGo(input: ExtractInput): Promise<GeneratedCard[]> {
    const cards: GeneratedCard[] = [];
    const lines = input.content.split(/\r?\n/);
    let documented = false;

    for (const line of lines) {
      if (/^\s*\/\//.test(line)) {
        documented = true;
        continue;
      }

      const declaration = goDeclaration(line);
      if (declaration && !documented) {
        cards.push({
          question: `Which file defines the \`${declaration.name}\` ${declaration.kind}?`,
          answer: `\`${declaration.name}\` is an exported ${declaration.kind} defined in \`${input.path}\`.`,
          source: { path: input.path, sha: input.sha },
        });
      }
      documented = false;
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
