import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { Card } from "../../../contracts/index.js";

const exec = promisify(execFile);
const entry = fileURLToPath(new URL("../src/index.ts", import.meta.url));

/** A temporary directory with symlinks resolved.
 *
 *  On macOS `os.tmpdir()` is `/var/...`, a symlink to `/private/var/...`, and a
 *  spawned process reports the resolved form from `process.cwd()`. Comparing a
 *  command's project against the unresolved path fails there and nowhere else,
 *  so these tests only passed on Linux CI. */
async function tempDirectory(prefix: string): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), prefix)));
}

test("real commands use per-invocation directories and leave old configuration untouched", async (t) => {
  const root = await tempDirectory("flashlearn-directory-");
  t.after(() => rm(root, { recursive: true, force: true }));
  const cwd = join(root, "working dir");
  const configHome = join(root, "config");
  await mkdir(cwd);
  await mkdir(join(configHome, "flashlearn"), { recursive: true });
  const config = join(configHome, "flashlearn/config.json");
  const original = JSON.stringify({ FLASHLEARN_PROJECT: "/old/project" });
  await writeFile(config, original);
  const env = { ...process.env, XDG_CONFIG_HOME: configHome, FLASHLEARN_PROJECT: "/environment/project" };
  const run = (args: string[]) => exec(process.execPath, ["--import", import.meta.resolve("tsx"), entry, ...args], { cwd, env, timeout: 10000 });
  const initialized = await run(["init"]);
  assert.match(initialized.stdout, /Initialized/);
  assert(!initialized.stdout.includes("Active project"));
  const status = await run(["project", "status", "-o", "json"]);
  assert.equal(JSON.parse(status.stdout).project, cwd);
  assert.equal(status.stderr.trim(), `Project: ${cwd}`);
  const other = join(root, "another project");
  await run(["init", "--project", other]);
  assert.equal(JSON.parse((await run(["project", "show", "-p", other, "-o", "json"])).stdout).project, other);
  assert.equal(JSON.parse((await run(["project", "status", "-o", "json"])).stdout).project, cwd);
  assert.equal(await readFile(config, "utf8"), original);
});

test("noninteractive startup requires approval and scoped generation bootstraps storage", async (t) => {
  const cwd = await tempDirectory("flashlearn-bootstrap-");
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const env = { ...process.env };
  delete env.FLASHLEARN_ENDPOINT_URL;
  delete env.FLASHLEARN_ENDPOINT_MODEL;
  const run = (args: string[]) => exec(process.execPath, ["--import", import.meta.resolve("tsx"), entry, ...args], { cwd, env, timeout: 10000 });
  await assert.rejects(() => run(["start"]), (error: unknown) => {
    const failure = error as Error & { code: number; stderr: string };
    assert.equal(failure.code, 1);
    assert.match(failure.stderr, /Required first step:/);
    return true;
  });
  await assert.rejects(() => access(join(cwd, ".flashlearn")), { code: "ENOENT" });
  await assert.rejects(() => run(["start", "--yes"]), (error: unknown) => {
    const failure = error as Error & { code: number; stderr: string; stdout: string };
    assert.equal(failure.code, 1);
    assert.match(failure.stderr, /No study cards are available/);
    assert(!failure.stdout.includes("FlashLearn running"));
    return true;
  });
  await mkdir(join(cwd, "docs"));
  await writeFile(join(cwd, "docs", "a.md"), "# Retry policy\nFailed requests use exponential backoff with jitter to avoid overwhelming an unavailable server.\n");
  await writeFile(join(cwd, "docs", "b.md"), "# Request authentication\nEvery incoming request must present a signed access token before the server accepts its payload.\n");
  await writeFile(join(cwd, "README.md"), "# Storage guarantees\nWrites replace the previous file atomically so readers never observe a partially written document.\n");
  const generated = await run(["generate", "--subpath", "docs", "--max-files", "1"]);
  assert.match(generated.stdout, /Generated and stored 1 card/);
  for (const filename of ["cards.json", "review.json", "settings.json"]) await access(join(cwd, ".flashlearn", filename));
  const cards = JSON.parse((await run(["question", "list", "-o", "json"])).stdout) as Card[];
  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.source.path, "docs/a.md");
  const card = JSON.parse((await run(["question", "get", cards[0]!.id, "-o", "json"])).stdout) as Card;
  assert.deepEqual(card, cards[0]);
});
