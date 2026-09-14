import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { promisify } from "node:util";
import type { GeneratedCard } from "../../../contracts/index.js";

export { ExtractionService } from "./workstream.js";
export type { ExtractionWorkstream, SourceDocument } from "./workstream.js";

const execFileAsync = promisify(execFile);
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".md", ".ts", ".tsx"]);
const IGNORED_DIRECTORIES = new Set([".git", ".flashlearn", "dist", "node_modules"]);

export interface QuestionExtractor {
  extract(input: { path: string; content: string; sha: string }): Promise<GeneratedCard[]>;
}

export class AnnotationExtractor implements QuestionExtractor {
  async extract(input: { path: string; content: string; sha: string }): Promise<GeneratedCard[]> {
    const cards: GeneratedCard[] = [];
    const pattern = /(?:\/\/|#|<!--)\s*Q:\s*(.+?)(?:-->)?\s*\r?\n(?:\/\/|#|<!--)\s*A:\s*(.+?)(?:-->)?\s*$/gm;
    for (const match of input.content.matchAll(pattern)) {
      if (match[1] && match[2]) {
        cards.push({ question: match[1].trim(), answer: match[2].trim(), source: { path: input.path, sha: input.sha } });
      }
    }
    return cards;
  }
}

async function sourceFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return IGNORED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(root, path);
    return entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
  }));
  return paths.flat();
}

export async function generateCards(root: string, extractor: QuestionExtractor = new AnnotationExtractor()): Promise<GeneratedCard[]> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
  const sha = stdout.trim();
  const files = await sourceFiles(root);
  return (await Promise.all(files.map(async (path) => extractor.extract({
    path: relative(root, path),
    content: await readFile(path, "utf8"),
    sha,
  })))).flat();
}
