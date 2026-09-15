import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { GeneratedCard } from "../../../contracts/index.js";
import { reportOnRepository } from "../src/corpus.js";
import { formatReport, summarizeCards } from "../src/report.js";

function card(path: string, question: string, answer = "Answer."): GeneratedCard {
  return { question, answer, source: { path, sha: "sha" } };
}

test("summarizeCards counts cards and files per extension", () => {
  const report = summarizeCards([
    card("pkg/a.go", "One"),
    card("pkg/a.go", "Two"),
    card("pkg/b.go", "Three"),
    card("docs/guide.md", "Four"),
  ]);

  assert.equal(report.cards, 4);
  assert.equal(report.files, 3);
  assert.deepEqual(report.byExtension, [
    { extension: ".go", cards: 3, files: 2 },
    { extension: ".md", cards: 1, files: 1 },
  ]);
});

test("summarizeCards ranks the files producing the most cards", () => {
  const report = summarizeCards([
    card("low.ts", "One"),
    card("high.ts", "Two"),
    card("high.ts", "Three"),
    card("high.ts", "Four"),
  ]);

  assert.deepEqual(report.topFiles[0], { path: "high.ts", cards: 3 });
  assert.deepEqual(report.topFiles[1], { path: "low.ts", cards: 1 });
});

test("summarizeCards reports answer length distribution", () => {
  const report = summarizeCards([
    card("a.ts", "One", "aa"),
    card("b.ts", "Two", "aaaa"),
    card("c.ts", "Three", "aaaaaa"),
  ]);

  assert.deepEqual(report.answerLength, { min: 2, median: 4, mean: 4, max: 6 });
});

test("summarizeCards flags repeated questions within one file", () => {
  const report = summarizeCards([
    card("a.ts", "Same"),
    card("a.ts", "Same"),
    card("b.ts", "Same"),
  ]);

  assert.equal(report.duplicateQuestions, 1, "same question in different files is not a duplicate");
});

test("summarizeCards handles an empty corpus", () => {
  const report = summarizeCards([]);

  assert.equal(report.cards, 0);
  assert.equal(report.files, 0);
  assert.deepEqual(report.byExtension, []);
  assert.deepEqual(report.answerLength, { min: 0, median: 0, mean: 0, max: 0 });
});

test("formatReport renders counts and omits the duplicate line when clean", () => {
  const output = formatReport(summarizeCards([card("pkg/a.go", "One")]));

  assert.match(output, /Cards: 1/);
  assert.match(output, /\.go\s+1 cards/);
  assert.ok(!output.includes("Duplicate questions"), "no duplicate section for a clean corpus");
});

test("formatReport reports duplicates when a file repeats a question", () => {
  const output = formatReport(summarizeCards([card("a.ts", "Same"), card("a.ts", "Same")]));

  assert.match(output, /Duplicate questions within a file: 1/);
});

test("summarizeCards labels files that have no extension", () => {
  const report = summarizeCards([card("Makefile", "One")]);

  assert.deepEqual(report.byExtension, [{ extension: "(none)", cards: 1, files: 1 }]);
});

test("summarizeCards limits the top files list to ten entries", () => {
  const cards = Array.from({ length: 15 }, (_, index) => card(`file${index}.ts`, `Q${index}`));

  assert.equal(summarizeCards(cards).topFiles.length, 10);
});

test("reportOnRepository summarizes a real directory on disk", async () => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-corpus-"));
  await mkdir(join(root, "pkg"), { recursive: true });
  await writeFile(
    join(root, "pkg", "server.go"),
    "// Serve starts the listener.\nfunc Serve() error {\n\treturn nil\n}\n",
  );
  await writeFile(join(root, "README.md"), "# Overview\nThe project does a thing.\n");

  const output = await reportOnRepository(root);

  assert.match(output, /Cards: 2/);
  assert.match(output, /\.go\s+1 cards/);
  assert.match(output, /\.md\s+1 cards/);
});

test("reportOnRepository handles a directory with no supported sources", async () => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-empty-"));
  await writeFile(join(root, "data.json"), "{}\n");

  const output = await reportOnRepository(root);

  assert.match(output, /Cards: 0/);
  assert.match(output, /Files with cards: 0/);
});
