import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { runCli } from "../src/cli.js";
import { createProductionDependencies } from "../src/production.js";
import { reviewInTerminal, type ReviewTerminal } from "../src/terminal-review.js";
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
  deps.generatedCards = [GENERATED_CARD];
  const service = new CliService(deps);
  await service.generate(root);
  return { deps, service, root, study: await service.study(root) };
}

test("terminal review hides answers until reveal, ignores invalid keys, and persists all ratings", async () => {
  const { deps, root, study } = await harness();
  let prompts = 0;
  const screen = terminal(["3", "enter", "bad", "1", "enter", " ", "2", "enter", "enter", "3", "enter", "enter", "4", "q"], (output) => {
    if (prompts++ < 2) assert(!output.includes(GENERATED_CARD.answer));
  });
  await reviewInTerminal(study, screen.io);
  assert.deepEqual(deps.scheduledReviews.map(({ result }) => result), ["incorrect", "hard", "correct", "easy"]);
  assert.equal((await deps.createReviewRepository(root).get(deps.scheduledReviews[0]!.state.cardId)).reviewCount, 4);
  assert.match(screen.output(), /Source: src\/app.ts @ abc123/);
  assert.match(screen.output(), /4 reviews saved/);
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
  const screen = terminal(Array.from({ length: 20 }, () => ["enter", "1", "enter"]).flat());
  await reviewInTerminal(study, screen.io);
  assert.equal(deps.scheduledReviews.length, 12);
  assert.match(screen.output(), /12 reviews saved/);
});

test("save failures terminate without claiming success or advancing", async () => {
  const { deps, root, study } = await harness();
  deps.createReviewRepository(root).save = async () => { throw new Error("Disk full"); };
  const screen = terminal(["enter", "3", "enter"]);
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
  const screen = terminal(["enter", "3", "q"]);
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
    deps.generateCards = async () => [GENERATED_CARD];
    const service = new CliService(deps);
    const [card] = await service.generate(root);
    const first = terminal(["enter", "3", "enter"]);
    const errors: string[] = [];
    const io = { cwd: root, stdout: () => {}, stderr: (text: string) => { errors.push(text); }, openReviewTerminal: () => first.io };
    assert.equal(await runCli(["review"], service, io), 0, errors.join("\n"));
    assert.match(first.output(), /Saved: correct\. Next due:/);
    assert.match(first.output(), /All caught up/);
    const fresh = new CliService(createProductionDependencies());
    assert.equal((await fresh.status(root)).reviewed, 1);
    assert.equal((await deps.createReviewRepository(root).get(card!.id)).reviewCount, 1);
    assert.equal(await (await fresh.study(root)).nextCard(), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
