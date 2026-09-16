import { execFile } from "node:child_process";
import { open, readdir } from "node:fs/promises";
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

/**
 * Machine-generated sources by filename. Generated code describes a generator's
 * output rather than intent, so it is not useful onboarding material.
 */
const GENERATED_NAME = /(^|[./_-])(zz_generated|bindata)|\.pb\.go$|_generated\.go$|(^|\/)generated\.go$/i;

/** Release notes describe past releases, not how the system works. */
const CHANGELOG_NAME = /(^|\/)changelog[^/]*\.md$/i;

/** Go's canonical generated-file marker, which must appear near the top of a file. */
const GENERATED_MARKER = /^\/\/ Code generated .* DO NOT EDIT\.$/m;

/** Bytes sniffed when checking for the generated marker. */
const SNIFF_BYTES = 2048;

/** Go test files document the tests, not the package. */
export function isGoTestPath(path: string): boolean {
  return /_test\.go$/i.test(path);
}

/** True when a filename alone identifies the file as generated or low value. */
export function isGeneratedPath(path: string): boolean {
  return GENERATED_NAME.test(path) || CHANGELOG_NAME.test(path);
}

/**
 * True when file content declares itself generated. Only the head of the file is
 * examined: the marker must appear near the top, and some generated sources are
 * megabytes long, so reading them in full just to reject them is wasteful.
 */
export function isGeneratedContent(head: string): boolean {
  return GENERATED_MARKER.test(head);
}

/** Read the first bytes of a file so the generated marker can be checked cheaply. */
async function sniff(path: string): Promise<string> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

/**
 * True when a file should not be scanned at all. Filtering during traversal
 * rather than inside each extractor means generated sources are never read,
 * and benefits the endpoint path as much as the deterministic one.
 */
async function isSkipped(path: string): Promise<boolean> {
  if (isGoTestPath(path) || isGeneratedPath(path)) return true;
  if (extname(path).toLowerCase() !== ".go") return false;

  try {
    return isGeneratedContent(await sniff(path));
  } catch {
    return false;
  }
}

/** Recursively collect supported source file paths, skipping ignored directories. */
export async function sourceFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return IGNORED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(root, path);
      if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) return [];
      return (await isSkipped(path)) ? [] : [path];
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
