import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import type { GeneratedCard } from "../../../contracts/index.js";

const execFileAsync = promisify(execFile);

export const SOURCE_EXTENSIONS = new Set([".go", ".js", ".jsx", ".md", ".ts", ".tsx"]);
export const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".flashlearn",
  "_output",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "testdata",
  "third_party",
  "vendor",
]);

/** Extension seam: swap the deterministic baseline for an AI-backed generator. */
export interface QuestionExtractor {
  extract(input: { path: string; content: string; sha: string }): Promise<GeneratedCard[]>;
}

/** Recursively collect supported source file paths, skipping ignored directories. */
export async function sourceFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return IGNORED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(root, path);
      return entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name)) ? [path] : [];
    }),
  );
  return paths.flat();
}

/** Normalize to repository-relative POSIX form so attribution is stable across platforms. */
export function toRepositoryPath(root: string, absolutePath: string): string {
  return relative(root, absolutePath).split(sep).join("/");
}

/** Current commit SHA, or `"unknown"` outside a Git working tree. */
export async function headSha(root: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}

/** Blob SHA for one tracked file, falling back to the commit SHA when unavailable. */
export async function fileSha(root: string, repositoryPath: string, fallback: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", `HEAD:${repositoryPath}`], { cwd: root });
    const sha = stdout.trim();
    return sha.length > 0 ? sha : fallback;
  } catch {
    return fallback;
  }
}
