import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../scripts/check-package-scope.mjs", import.meta.url));
const CHILD_ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", env: CHILD_ENV }).trim();
}

/** Run the scope check, returning its exit code and combined output. */
function checkScope(cwd, ...args) {
  try {
    return { code: 0, output: execFileSync("node", [SCRIPT, ...args], { cwd, encoding: "utf8", env: CHILD_ENV }) };
  } catch (error) {
    return { code: error.status, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

async function commitFile(root, path, contents) {
  const full = join(root, path);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, contents);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", `edit ${path}`);
}

/** A repository with main at one commit and a feature branch cut from it. */
async function repository() {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-scope-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  await commitFile(root, "README.md", "base\n");
  return root;
}

test("accepts a branch touching one package", async () => {
  const root = await repository();
  git(root, "checkout", "-q", "-b", "feature");
  await commitFile(root, "packages/extraction/src/a.ts", "export const a = 1;\n");

  const result = checkScope(root, "main", "feature");

  assert.equal(result.code, 0);
  assert.match(result.output, /Package scope is valid: extraction/);
});

test("rejects a branch touching two packages", async () => {
  const root = await repository();
  git(root, "checkout", "-q", "-b", "feature");
  await commitFile(root, "packages/extraction/src/a.ts", "export const a = 1;\n");
  await commitFile(root, "packages/storage/src/b.ts", "export const b = 2;\n");

  const result = checkScope(root, "main", "feature");

  assert.equal(result.code, 1);
  assert.match(result.output, /only one package/);
  assert.match(result.output, /extraction, storage/);
});

test("accepts a branch when an unrelated package lands on main afterward", async () => {
  const root = await repository();
  git(root, "checkout", "-q", "-b", "feature");
  await commitFile(root, "packages/extraction/src/a.ts", "export const a = 1;\n");

  // Main advances into a different package after the branch was cut. A two-dot
  // diff would attribute the CLI files to this branch and fail it.
  git(root, "checkout", "-q", "main");
  await commitFile(root, "packages/cli/src/c.ts", "export const c = 3;\n");

  const result = checkScope(root, "main", "feature");

  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /Package scope is valid: extraction/);
});

test("accepts a branch that changes no package", async () => {
  const root = await repository();
  git(root, "checkout", "-q", "-b", "docs");
  await commitFile(root, "README.md", "updated\n");

  const result = checkScope(root, "main", "docs");

  assert.equal(result.code, 0);
  assert.match(result.output, /no package changes/);
});

test("exits 2 when arguments are missing", async () => {
  const root = await repository();

  const result = checkScope(root, "main");

  assert.equal(result.code, 2);
  assert.match(result.output, /Usage:/);
});

test("package README cleanup can accompany one implementation package", async () => {
  const root = await repository();
  git(root, "checkout", "-q", "-b", "docs");
  await commitFile(root, "packages/extraction/README.md", "Extraction\n");
  await commitFile(root, "packages/storage/README.md", "Storage\n");
  assert.equal(checkScope(root, "main", "docs").code, 0);
  await commitFile(root, "packages/frontend/test/site.test.ts", "export {};\n");
  assert.equal(checkScope(root, "main", "docs").code, 0);
  await commitFile(root, "packages/storage/docs/design.md", "Storage design\n");
  assert.equal(checkScope(root, "main", "docs").code, 1);
});

test("exits 2 when a ref cannot be resolved", async () => {
  const root = await repository();

  const result = checkScope(root, "main", "does-not-exist");

  assert.equal(result.code, 2);
  assert.match(result.output, /Unable to compare/);
});
