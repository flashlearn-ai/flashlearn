import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../scripts/check-generated-content.mjs", import.meta.url));

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Run the gate over staged files, returning exit code and output. */
function checkStaged(cwd) {
  try {
    return { code: 0, output: execFileSync("node", [SCRIPT], { cwd, encoding: "utf8" }) };
  } catch (error) {
    return { code: error.status, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

async function repository() {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-content-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  return root;
}

/** Stage one file with the given contents. */
async function stage(root, path, contents) {
  const full = join(root, path);
  await mkdir(join(full, ".."), { recursive: true });
  await writeFile(full, contents);
  git(root, "add", "-f", path);
}

test("accepts ordinary source changes", async () => {
  const root = await repository();
  await stage(root, "packages/extraction/src/a.ts", "export const a = 1;\n");

  const result = checkStaged(root);

  assert.equal(result.code, 0, result.output);
  assert.match(result.output, /No generated or confidential content/);
});

test("blocks force-added FlashLearn runtime state", async () => {
  const root = await repository();
  await stage(root, ".flashlearn/cards.json", "[]\n");

  const result = checkStaged(root);

  assert.equal(result.code, 1);
  assert.match(result.output, /runtime state/);
});

test("blocks locally ingested repository content", async () => {
  const root = await repository();
  await stage(root, "knowledge/aks-rp/notes.md", "# Internal\nDetails.\n");

  const result = checkStaged(root);

  assert.equal(result.code, 1);
  assert.match(result.output, /ingested repository content/);
});

test("blocks generated cards hiding under an unexpected filename", async () => {
  const root = await repository();
  const cards = JSON.stringify([
    { question: "What does Serve do?", answer: "Starts the listener.", source: { path: "a.go", sha: "abc" } },
  ]);
  await stage(root, "docs/export.json", cards);

  const result = checkStaged(root);

  assert.equal(result.code, 1, "path rules alone would miss this");
  assert.match(result.output, /generated FlashLearn cards/);
});

test("blocks an endpoint API key", async () => {
  const root = await repository();
  // Assembled at runtime so this test file does not itself trip the gate.
  const variable = ["FLASHLEARN", "ENDPOINT", "API", "KEY"].join("_");
  await stage(root, "notes.txt", `${variable}=${`ghp_${"a".repeat(36)}`}\n`);

  const result = checkStaged(root);

  assert.equal(result.code, 1);
});

test("blocks a private key block", async () => {
  const root = await repository();
  await stage(root, "config/local.txt", "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----\n");

  const result = checkStaged(root);

  assert.equal(result.code, 1);
  assert.match(result.output, /private key block/);
});

test("blocks key material by extension", async () => {
  const root = await repository();
  await stage(root, "certs/server.pem", "irrelevant\n");

  const result = checkStaged(root);

  assert.equal(result.code, 1);
  assert.match(result.output, /private key material/);
});

test("allows .env.example and test fixtures", async () => {
  const root = await repository();
  await stage(root, ".env.example", "FLASHLEARN_ENDPOINT_URL=\nFLASHLEARN_ENDPOINT_MODEL=\n");
  await stage(
    root,
    "packages/extraction/test/fixtures/cards.json",
    JSON.stringify([{ question: "Q", answer: "A", source: { path: "a.ts", sha: "s" } }]),
  );

  const result = checkStaged(root);

  assert.equal(result.code, 0, result.output);
});

test("does not flag ordinary JSON that merely has a question field", async () => {
  const root = await repository();
  await stage(root, "docs/faq.json", JSON.stringify([{ question: "Why?", because: "Reasons." }]));

  const result = checkStaged(root);

  assert.equal(result.code, 0, "attribution fields are what identify generated cards");
});

test("compares two refs and ignores files already on the base", async () => {
  const root = await repository();
  await stage(root, "README.md", "base\n");
  git(root, "commit", "-q", "-m", "base");

  git(root, "checkout", "-q", "-b", "feature");
  await stage(root, "packages/extraction/src/a.ts", "export const a = 1;\n");
  git(root, "commit", "-q", "-m", "feature");

  const result = (() => {
    try {
      return { code: 0, output: execFileSync("node", [SCRIPT, "main", "feature"], { cwd: root, encoding: "utf8" }) };
    } catch (error) {
      return { code: error.status, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
    }
  })();

  assert.equal(result.code, 0, result.output);
});

test("exits 2 when only one ref is supplied", async () => {
  const root = await repository();

  try {
    execFileSync("node", [SCRIPT, "main"], { cwd: root, encoding: "utf8" });
    assert.fail("expected a non-zero exit");
  } catch (error) {
    assert.equal(error.status, 2);
    assert.match(`${error.stderr}`, /Usage:/);
  }
});
