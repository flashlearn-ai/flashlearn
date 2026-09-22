import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyCategories, categorizeCards } from "../src/categories.js";
import { createProductionDependencies } from "../src/production.js";
import { CliService } from "../src/workstream.js";

const cards = Array.from({ length: 10 }, (_, id) => ({
  question: `How does lifecycle operation ${id} retain state?`,
  answer: `Lifecycle operation ${id} writes persistent snapshots before releasing worker capacity.`,
  source: { path: `src/file-${id}.go`, sha: "abc" },
}));
const groups = [
  { name: "Actor Lifecycle", cardIds: [0, 1, 2, 3, 4] },
  { name: "Snapshot Persistence", cardIds: [5, 6, 7, 8, 9] },
];
const reply = (categories = groups) => JSON.stringify({ categories });

test("LLM categories are stored as first tags without altering question, answer or source", async () => {
  const result = await categorizeCards(cards, async (prompt, model, timeout) => {
    assert(prompt.includes(cards[0]!.answer));
    assert(prompt.includes("at least 5"));
    assert.equal(model, "auto");
    assert.equal(timeout, 300_000);
    return reply();
  }, "auto");
  assert.deepEqual(result.map(({ tags }) => tags?.[0]), Array(5).fill("Actor Lifecycle").concat(Array(5).fill("Snapshot Persistence")));
  result.forEach(({ tags, ...card }, index) => assert.deepEqual(card, cards[index]));
});

test("category partitions reject undersized, missing, duplicate, invented and vague assignments", () => {
  for (const invalid of [
    [{ name: "Actor Lifecycle", cardIds: [0, 1, 2, 3] }, { name: "Snapshot Persistence", cardIds: [4, 5, 6, 7, 8, 9] }],
    [groups[0]!],
    [groups[0]!, { ...groups[1]!, cardIds: [0, 6, 7, 8, 9] }],
    [groups[0]!, { ...groups[1]!, cardIds: [5, 6, 7, 8, 10] }],
    [groups[0]!, { ...groups[1]!, name: "actor lifecycle" }],
    [{ ...groups[0]!, name: "General" }, groups[1]!],
  ]) assert.throws(() => applyCategories(cards, reply(invalid)));
  assert.throws(() => applyCategories(cards, "not json"));
});

test("invalid categorization gets one repair attempt identifying missing IDs", async () => {
  let calls = 0;
  const result = await categorizeCards(cards, async (prompt) => {
    if (calls++ === 0) return reply([groups[0]!]);
    assert.match(prompt, /missing IDs: 5, 6, 7, 8, 9/);
    return reply();
  }, "auto");
  assert.equal(calls, 2);
  assert.equal(result.length, cards.length);
});

test("small decks and failed LLM grouping fail explicitly instead of inventing filler topics", async () => {
  await assert.rejects(categorizeCards(cards.slice(0, 4), async () => { assert.fail("no call for undersized deck"); }, "auto"), /at least five/);
  await assert.rejects(categorizeCards(cards, async () => null, "auto"), /returned no reply/);
  await assert.rejects(categorizeCards(cards, async () => reply([groups[0]!]), "auto"), /no new study cards were saved/);
});

test("production storage persists category tags and exposes them through the card repository", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-categories-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const deps = createProductionDependencies();
  deps.generateCards = async () => applyCategories(cards, reply());
  const saved = await new CliService(deps).generate(root);
  const stored = JSON.parse(await readFile(join(root, ".flashlearn/cards.json"), "utf8"));
  assert.deepEqual(stored, saved);
  assert.equal(stored.filter((card: { tags: string[] }) => card.tags[0] === "Actor Lifecycle").length, 5);
  assert.equal((await deps.createCardRepository(root).list())[9]?.tags?.[0], "Snapshot Persistence");
});
