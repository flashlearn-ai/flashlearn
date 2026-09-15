import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GeneratedCard } from "../../../contracts/index.js";
import { ExtractionService, type QuestionExtractor } from "../src/index.js";

async function fixtureRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-extraction-"));
  await writeFile(join(root, "a.ts"), "/** Adds numbers. */\nexport function add() {}\n");
  await writeFile(join(root, "notes.md"), "# Overview\nExplains the project.\n");
  await writeFile(join(root, "ignored.txt"), "# Skipped\nNot a supported extension.\n");
  await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
  await writeFile(join(root, "node_modules", "pkg", "dep.ts"), "/** Dep. */\nexport function dep() {}\n");
  return root;
}

test("scanRepository returns sorted supported files and skips ignored directories", async (t) => {
  const root = await fixtureRepository();
  t.after(async () => rm(root, { recursive: true, force: true }));

  const documents = await new ExtractionService().scanRepository(root);

  assert.deepEqual(documents.map((document) => document.path), ["a.ts", "notes.md"]);
  for (const document of documents) {
    assert.ok(document.sha.length > 0, "every document carries a sha");
    assert.ok(document.content.length > 0, "every document carries content");
  }
});

test("generateFromDocument attributes cards and drops duplicate entries", async () => {
  const cards = await new ExtractionService().generateFromDocument({
    path: "docs/guide.md",
    sha: "abc123",
    content: "# Setup\nRun the CLI.\n\n# Setup\nRun the CLI.\n",
  });

  assert.equal(cards.length, 1, "identical questions from one file collapse");
  assert.deepEqual(cards[0]?.source, { path: "docs/guide.md", sha: "abc123" });
});

test("generateFromRepository combines cards across documents", async (t) => {
  const root = await fixtureRepository();
  t.after(async () => rm(root, { recursive: true, force: true }));

  const cards = await new ExtractionService().generateFromRepository(root);

  assert.deepEqual(cards.map((card) => card.question).sort(), [
    'What does "Overview" cover?',
    "What does `add()` do?",
  ]);
  for (const card of cards) {
    assert.ok(card.source.path.length > 0 && card.source.sha.length > 0);
    assert.equal(Object.keys(card).sort().join(","), "answer,question,source");
  }
});

test("generateFromRepository honors an injected extractor", async (t) => {
  const root = await fixtureRepository();
  t.after(async () => rm(root, { recursive: true, force: true }));

  const stub: QuestionExtractor = {
    async extract(input): Promise<GeneratedCard[]> {
      return [{ question: `Summarize ${input.path}?`, answer: "Stub.", source: { path: input.path, sha: input.sha } }];
    },
  };

  const cards = await new ExtractionService(stub).generateFromRepository(root);

  assert.deepEqual(cards.map((card) => card.question), ["Summarize a.ts?", "Summarize notes.md?"]);
});
