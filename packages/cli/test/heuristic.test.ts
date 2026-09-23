import assert from "node:assert/strict";
import test from "node:test";
import { heuristicCards } from "../src/heuristic.js";
import { selectCards } from "../src/card-quality.js";

const document = (content: string, path = "README.md") => ({ path, content, sha: "real" });

test("offline definitions preserve full source meaning and useful domain terms", () => {
  const cards = heuristicCards(document("# Runtime\n## Concepts\n- **Worker**: a persistent process that runs one workload at a time. It must release resources before reuse.\n- **Actor**: a suspended application with persistent identity and snapshots. It can move between workers.\n"));
  assert.equal(cards.length, 2);
  assert.match(cards[0]!.question, /what does Worker mean/);
  assert.equal(cards[0]!.answer, "Worker: a persistent process that runs one workload at a time. It must release resources before reuse.");
});

test("procedures, badges and fenced examples never turn into incomplete cards", () => {
  const cards = heuristicCards(document("# Runtime\n![badge](https://example.test/badge)\nNOTE: Not an officially supported product.\n## Installation\n### Worker\nWorkers must be installed before use. Install instructions are important.\n## Retry policy\nRequests retry according to the following:\n```sh\nrun --retry\n```\n## Notes\nThis refers to the steps above.\n"));
  assert.deepEqual(cards, []);
});

test("sentence extraction keeps abbreviation prefixes and rejects dangling fragments", () => {
  const content = "# Runtime\n## Recovery\nThe scheduler restores state (e.g. after worker failure). It must reserve capacity before running.\n";
  const cards = heuristicCards(document(content));
  assert.equal(cards.length, 1);
  assert.match(cards[0]!.answer, /^The scheduler restores state \(e.g. after worker failure\)/);
  assert.deepEqual(heuristicCards(document("# Runtime\n## Recovery\nThe scheduler restores state after failure and requires:\n")), []);
});

test("code recall cites the file and retains rationale without inventing a why answer", () => {
  const content = "// Store is a persistent cache holding immutable snapshots.\n//\n// Keys must change when source content changes to avoid stale reads.\ntype Store struct {}";
  const [card] = heuristicCards(document(content, "cache/store.go"));
  assert.match(card!.question, /`Store`.*cache\/store.go/);
  assert.match(card!.answer, /Keys must change/);
  assert.deepEqual(card!.source, { path: "cache/store.go", sha: "real" });
});

test("aspirational documentation is qualified and procedure repositories are excluded", () => {
  const source = "# Architecture\nNOTE: This architecture is aspirational.\n## Worker lifecycle\nWorkers restore persistent snapshots before routing traffic to the application.\n";
  assert.match(heuristicCards(document(source))[0]!.answer, /^Documented design/);
  assert.deepEqual(heuristicCards(document(source, "tools/setup/README.md")), []);
});

test("late implementation caveats survive in Markdown and code-comment answers", () => {
  const prose = "Workers persist snapshots before releasing capacity. Durable snapshots keep application state intact across replacement. This behavior is planned and is not implemented in the current release.";
  const [markdown] = heuristicCards(document(`# Runtime\n## Recovery\n${prose}\n`));
  assert(markdown);
  assert.equal(markdown.answer, prose);
  const comment = prose.replace(/^Workers persist/, "Store provides");
  const [code] = heuristicCards(document(`// ${comment}\ntype Store struct {}`, "store.go"));
  assert(code);
  assert.match(code.answer, /planned and is not implemented/);
  const [separateParagraph] = heuristicCards(document(`// Store provides persistent snapshots before releasing worker capacity.\n//\n// This behavior is experimental and requires a feature flag.\ntype Store struct {}`, "store.go"));
  assert.match(separateParagraph!.answer, /experimental and requires a feature flag/);
});

test("overlong or incomplete caveated passages are rejected rather than stripped", () => {
  for (const prose of [
    "Workers persist snapshots before releasing capacity. Durable storage preserves state after a restart. This requires",
    `Workers persist snapshots before releasing capacity. ${"Additional explanation fills space. ".repeat(20)}This is only available with a feature flag.`,
  ]) {
    assert.deepEqual(heuristicCards(document(`# Runtime\n## Recovery\n${prose}`)), []);
  }
});

test("JSDoc retains summaries while excluding annotation blocks and continuation text", () => {
  const summary = "Cache provides immutable snapshots to prevent stale reads during recovery.";
  const source = `/** ${summary}\n * @param key The snapshot identifier\n *   continuation text describing the key format\n * @returns The cached snapshot\n */\nexport function Cache(key: string) {}`;
  const [card] = heuristicCards(document(source, "src/cache.ts"));
  assert(card);
  assert.equal(card.answer, summary);
  assert(!card.answer.includes("continuation"));
  assert.deepEqual(heuristicCards(document(source.replace("@param", "@deprecated\n * @param"), "src/cache.ts")), []);
  assert.deepEqual(heuristicCards(document(source.replace("The cached snapshot", "Only available with an experimental feature flag"), "src/cache.ts")), []);
});

test("distinct subjects under one heading survive the final quality selector", () => {
  const source = "# Runtime\n## Scheduling\nWorkers reserve capacity before activation to prevent two actors claiming the same slot.\n\nFailed reservations must be retried after releasing the lease to avoid leaking capacity.\n";
  const candidates = heuristicCards(document(source));
  const selected = selectCards(candidates).cards;
  assert.equal(selected.length, 2);
  assert.notEqual(selected[0]!.question, selected[1]!.question);
  assert(candidates.some((card) => card.question.includes("Workers")));
  assert(candidates.some((card) => card.question.includes("Failed reservations")));
});

test("without a recoverable subject the strongest representative is chosen deliberately", () => {
  const source = "# Runtime\n## Recovery\nDuring recovery, snapshots restore application state before workloads accept requests.\n\nBefore running, capacity must be reserved to prevent conflicting worker assignments.\n";
  const candidates = heuristicCards(document(source));
  assert.equal(candidates.length, 1);
  assert.match(candidates[0]!.answer, /capacity must be reserved/);
});
