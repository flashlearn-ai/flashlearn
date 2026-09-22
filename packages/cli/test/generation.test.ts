import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { generateBounded } from "../src/generation.js";
import { copilotBatch } from "../src/providers.js";
import { generationProgress } from "../src/progress.js";
import { CliService } from "../src/workstream.js";
import { GENERATED_CARD, RecordingDependencies } from "./fakes/harness.js";
import type { GenerationProgress } from "../src/dependencies.js";

test("the orchestration boundary saves no more than 100 cards and preserves existing cards", async () => {
  const deps = new RecordingDependencies();
  deps.generatedCards = Array.from({ length: 120 }, (_, i) => ({ ...GENERATED_CARD, question: `Question ${i}?` }));
  const service = new CliService(deps);
  const progress: GenerationProgress[] = [];
  const cards = await service.generate("/repo", { onProgress: (event) => progress.push(event) });
  assert.equal(cards.length, 100);
  assert.equal(deps.createCardRepository("/repo").saved.length, 100);
  assert.equal(progress.at(-1)?.phase, "done");
  assert.equal(progress.at(-1)?.cards, 100);
  deps.generatedCards = [{ ...GENERATED_CARD, question: "Another run?" }];
  await service.generate("/repo");
  assert.equal((await deps.createCardRepository("/repo").list()).length, 101);
});

test("deterministic generation rejects repeated answers instead of filling the card budget", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-bounded-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "README.md"), Array.from({ length: 120 }, (_, i) => `# Policy ${i}\nRequests use exponential backoff and randomized jitter before retrying a failed connection.\n`).join("\n"));
  const progress: GenerationProgress[] = [];
  const cards = await generateBounded(root, { provider: { kind: "deterministic" }, onProgress: (event) => progress.push(event) });
  assert.equal(cards.length, 1);
  assert.equal(progress[0]?.phase, "scanning");
  assert.equal(progress.at(-1)?.cards, 1);
  assert(cards.every((card) => card.source.path === "README.md"));
});

test("Copilot batches pass the model/deadline and reject invented source IDs", async () => {
  const inputs = [{ path: "a.ts", sha: "real-sha", content: "A stable evidence quote supporting an answer.\n" + "x".repeat(15000) }];
  const cards = await copilotBatch(inputs, "selected-model", 1234, async (prompt, model, timeout) => {
    assert.equal(model, "selected-model");
    assert.equal(timeout, 1234);
    assert(!prompt.includes("x".repeat(10001)));
    return JSON.stringify({ cards: [
      { fileId: 0, question: "Valid?", answer: "Grounded answer.", source: { path: "invented" } },
      { fileId: 1, question: "Invented?", answer: "Invalid." },
      { fileId: 0.5, question: "Fraction?", answer: "Invalid." },
    ].map((card) => ({ ...card, evidence: "A stable evidence quote supporting an answer.", goal: "invariant", concept: "Stable evidence" })) });
  });
  assert.deepEqual(cards.map((card) => card.source), [{ path: "a.ts", sha: "real-sha" }]);
  await assert.rejects(copilotBatch(inputs, "auto", 1, async () => null), /empty reply/);
  await assert.rejects(copilotBatch(inputs, "auto", 1, async () => "invalid"), /invalid card JSON/);
});

test("progress is a bar on a TTY and line-based without terminal escapes otherwise", () => {
  for (const tty of [true, false]) {
    const output: string[] = [];
    const report = generationProgress((value) => output.push(value), tty);
    report({ phase: "scanning", completed: 0, total: 0, cards: 0 });
    report({ phase: "generating", completed: 4, total: 8, cards: 50 });
    report({ phase: "done", completed: 100, total: 100, cards: 100 });
    assert.match(output.join(""), /\[======== {8}\] 4\/8 batches/);
    assert.match(output.at(-1)!, /100 cards saved.*elapsed.*\n$/);
    assert.equal(output.join("").includes("\u001b"), tty);
  }
});

test("progress hierarchy distinguishes category waiting, repair, elapsed time and checkpoint events", () => {
  let now = 1000;
  const output: string[] = [];
  const report = generationProgress((text) => output.push(text), false, () => now);
  report({ phase: "generating", completed: 1, total: 8, cards: 7, active: 6, failed: 1, resumed: 1,
    message: "Batch 1/8 saved to checkpoint — 7 candidates", requestStartedAt: now, timeoutMs: 900_000 });
  now += 60_000;
  report({ phase: "categorizing", completed: 0, total: 39, cards: 39, attempt: 1, requestStartedAt: now, timeoutMs: 900_000 });
  now += 60_000;
  report({ phase: "categorizing", completed: 0, total: 39, cards: 39, attempt: 2,
    message: "Repair needed: missing IDs: 38", requestStartedAt: now, timeoutMs: 900_000 });
  report({ phase: "paused", completed: 0, total: 39, cards: 39 });
  const text = output.join("");
  assert.match(text, /3\/6  Generate candidates/);
  assert.match(text, /6 active \| 1 failed \| 1 reused/);
  assert.match(text, /5\/6  Organize learning categories/);
  assert.match(text, /Waiting for model response \| 39 cards \| attempt 1\/2/);
  assert.match(text, /attempt 2\/2.*elapsed 2m 00s/);
  assert.match(text, /limit in 15m 00s/);
  assert.match(text, /STOPPED/);
  assert(!text.includes("\u001b"));
});

test("TTY status fits a narrow terminal, clears before stage events, and resets between runs", () => {
  let now = 0;
  const output: string[] = [];
  const report = generationProgress((text) => output.push(text), true, () => now, () => 45);
  report({ phase: "scanning", completed: 0, total: 0, cards: 0 });
  assert(output.at(-1)!.length < 45);
  now = 90_000;
  report({ phase: "generating", completed: 0, total: 8, cards: 0, message: "Batch started\nProvider detail" });
  assert(output.includes("\r\u001b[2K"));
  assert(output.join("").includes("    Batch started\n    Provider detail\n"));
  report({ phase: "done", completed: 5, total: 5, cards: 5 });
  assert(output.at(-1)!.endsWith("\n"));
  report({ phase: "scanning", completed: 0, total: 0, cards: 0 });
  report({ phase: "done", completed: 0, total: 0, cards: 0 });
  assert.match(output.at(-1)!, /elapsed 0m 00s/);
});
