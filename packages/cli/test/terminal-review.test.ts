import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { runCli } from "../src/cli.js";
import { createProductionDependencies } from "../src/production.js";
import { reviewInTerminal, terminalChoices, type ReviewTerminal } from "../src/terminal-review.js";
import { CliService } from "../src/workstream.js";
import { GENERATED_CARD, RecordingDependencies } from "./fakes/harness.js";

function terminal(keys: Array<string | null>, onRead?: (output: string) => void) {
  let output = "";
  let closed = false;
  const io: ReviewTerminal = {
    write: (text) => { output += text; },
    readKey: async () => { onRead?.(output); return keys.shift() ?? null; },
    close: () => { closed = true; },
  };
  return { io, output: () => output, closed: () => closed };
}

async function harness() {
  const deps = new RecordingDependencies();
  const root = resolve("/repo");
  deps.directories.add(root);
  deps.generatedCards = [GENERATED_CARD, { ...GENERATED_CARD, question: "What persists a review?", answer: "The repository saves the scheduled state." }];
  const service = new CliService(deps);
  await service.generate(root);
  return { deps, service, root, study: await service.study(root) };
}

test("terminal review offers choices, ignores invalid keys, and automatically scores right and wrong answers", async () => {
  const { deps, root, study } = await harness();
  let prompts = 0;
  const screen = terminal(["enter", "4", "bad", "1", "enter", "2", "q"], (output) => {
    if (prompts++ < 4) {
      assert.match(output, /\[1\] The init command\./);
      assert(!output.includes("Source:"));
      assert(!output.includes("Correct!"));
    }
  });
  await reviewInTerminal(study, screen.io, () => 0.999);
  assert.deepEqual(deps.scheduledReviews.map(({ result }) => result), ["correct", "incorrect"]);
  assert.equal((await deps.createReviewRepository(root).get(deps.scheduledReviews[0]!.state.cardId)).reviewCount, 2);
  assert.match(screen.output(), /Source: src\/app.ts @ abc123/);
  assert.match(screen.output(), /2 reviews saved/);
  assert.match(screen.output(), /Incorrect\. Answer \[1\]: The init command\./);
  assert(screen.closed());
  assert.equal(deps.listenCalls.length, 0);
});

test("quit or EOF before rating never submits a review", async () => {
  for (const keys of [["q"], [null], ["enter", "q"], ["enter", null]]) {
    const { deps, study } = await harness();
    const screen = terminal(keys);
    await reviewInTerminal(study, screen.io);
    assert.equal(deps.scheduledReviews.length, 0);
    assert.match(screen.output(), /0 reviews saved/);
    assert(screen.closed());
  }
});

test("immediately repeated cards count toward the twelve-review session cap", async () => {
  const { deps, study } = await harness();
  const screen = terminal(Array.from({ length: 20 }, () => ["2", "enter"]).flat());
  await reviewInTerminal(study, screen.io, () => 0.999);
  assert.equal(deps.scheduledReviews.length, 12);
  assert(deps.scheduledReviews.every(({ result }) => result === "incorrect"));
  assert.match(screen.output(), /12 reviews saved/);
});

test("save failures terminate without claiming success or advancing", async () => {
  const { deps, root, study } = await harness();
  deps.createReviewRepository(root).save = async () => { throw new Error("Disk full"); };
  const screen = terminal(["1", "enter"]);
  await assert.rejects(reviewInTerminal(study, screen.io), /Disk full/);
  assert.equal(deps.scheduledReviews.length, 1);
  assert(!screen.output().includes("Saved:"));
  assert.match(screen.output(), /0 reviews saved/);
  assert(screen.closed());
});

test("pending persistence blocks advancement and success messages", async () => {
  const { study } = await harness();
  let release!: () => void;
  let saving!: () => void;
  const started = new Promise<void>((resolve) => { saving = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const screen = terminal(["1", "q"]);
  const session = reviewInTerminal({ ...study, submitReview: async (id, rating) => {
    saving();
    await gate;
    return study.submitReview(id, rating);
  } }, screen.io);
  await started;
  assert.match(screen.output(), /Saving review/);
  assert(!screen.output().includes("Saved:"));
  assert(!screen.output().includes("Next due card"));
  assert(!screen.closed());
  release();
  await session;
  assert.match(screen.output(), /1 review saved/);
});

test("empty deck differs from no due cards and both restore the terminal", async () => {
  const { study } = await harness();
  const empty = terminal([]);
  await assert.rejects(reviewInTerminal({ ...study, listCards: async () => [] }, empty.io), /Run flashlearn generate/);
  assert(empty.closed());
  const caughtUp = terminal([]);
  await reviewInTerminal({ ...study, nextCard: async () => null }, caughtUp.io);
  assert.match(caughtUp.output(), /All caught up/);
  assert(caughtUp.closed());
});

test("source text cannot emit terminal escape commands", async () => {
  const { study } = await harness();
  const card = (await study.listCards())[0]!;
  const screen = terminal(["enter", "q"]);
  await reviewInTerminal({ ...study, nextCard: async () => ({ ...card, question: "\x1b[2JQuestion?", answer: "\x1b]52;c;secret\x07Answer.", tags: ["\x1b[31mtopic"] }) }, screen.io);
  assert(!/[\x1b\x07]/.test(screen.output()));
  assert.match(screen.output(), /Answer\./);
});

test("review command resolves project selection, rejects invalid flags, and requires a terminal", async () => {
  const { service, root } = await harness();
  const errors: string[] = [];
  const io = { cwd: root, stdout: () => {}, stderr: (text: string) => { errors.push(text); } };
  for (const args of [["review"], ["review", root], ["-p", root, "review"]]) {
    const screen = terminal(["q"]);
    assert.equal(await runCli(args, service, { ...io, openReviewTerminal: () => screen.io }), 0);
    assert(screen.closed());
  }
  assert.equal(await runCli(["review"], service, io), 1);
  assert.match(errors.at(-1)!, /interactive terminal/);
  for (const args of [["review", "--yes"], ["review", "--output", "json"], ["review", root, "--project", root]]) {
    assert.equal(await runCli(args, service, io), 2);
  }
  assert.equal(await runCli(["review", "--help"], service, io), 0);
});

test("terminal reviews persist real schedules and subsequent sessions exclude future cards", async () => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-terminal-"));
  try {
    const deps = createProductionDependencies();
    deps.createServer = () => { throw new Error("Terminal review must not start a server"); };
    deps.generateCards = async () => [GENERATED_CARD, { ...GENERATED_CARD, question: "What persists a review?", answer: "The repository saves the scheduled state." }];
    const service = new CliService(deps);
    const [card] = await service.generate(root);
    const first = terminal(["1", "enter", "1", "enter"]);
    await reviewInTerminal(await service.study(root), first.io, () => 0.999);
    assert.match(first.output(), /Saved: correct\. Next due:/);
    assert.match(first.output(), /All caught up/);
    const fresh = new CliService(createProductionDependencies());
    assert.equal((await fresh.status(root)).reviewed, 2);
    assert.equal((await deps.createReviewRepository(root).get(card!.id)).reviewCount, 1);
    assert.equal(await (await fresh.study(root)).nextCard(), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("choices are unique, bounded, topic-preferred, and shuffled with one correct option", async () => {
  const { study } = await harness();
  const card = (await study.listCards())[0]!;
  const pool = Array.from({ length: 6 }, (_, index) => ({ ...card, id: `other-${index}`, answer: `Alternative ${index}`, source: { path: `other-${index}.ts`, sha: "test" }, tags: index < 3 ? ["topic"] : [] }));
  const target = { ...card, tags: ["topic"] };
  const duplicate = { ...card, id: "duplicate", answer: "  THE init\ncommand! " };
  const choices = terminalChoices(target, [target, duplicate, { ...card, id: "empty", answer: " \x1b[31m " }, ...pool], () => 0.999);
  assert.equal(choices.length, 4);
  assert.equal(choices.filter((choice) => choice.correct).length, 1);
  assert.deepEqual(choices.map((choice) => choice.text), [card.answer, "Alternative 0", "Alternative 1", "Alternative 2"]);
  const shuffled = terminalChoices(target, pool, () => 0);
  assert.notEqual(shuffled.findIndex((choice) => choice.correct), 0);
});

test("single or duplicate-only answer decks end without scoring or falling back to recall", async () => {
  const { deps, study } = await harness();
  const card = (await study.listCards())[0]!;
  for (const pool of [[card], [card, { ...card, id: "duplicate" }]]) {
    const screen = terminal(["1"]);
    await reviewInTerminal({ ...study, listCards: async () => pool }, screen.io);
    assert.match(screen.output(), /at least two distinct/);
    assert(!screen.output().includes("Reveal answer"));
    assert.equal(deps.scheduledReviews.length, 0);
    assert(screen.closed());
  }
});
