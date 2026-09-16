import assert from "node:assert/strict";
import test from "node:test";
import { anonymizeAnswer, buildChoices, classify, confusedWith, dealSession, type Card } from "../client/src/lib/deck.js";

function card(id: string, answer: string): Card {
  return { id, question: `What does \`${id}()\` do?`, answer,
    source: { path: `sample/${id}.ts`, sha: "unknown" }, createdAt: "now", updatedAt: "now" };
}
const pool = [card("Manager", "Manager tracks allocations."), card("Create", "Create returns an in-memory manager."), card("Info", "Info constructs a resource description.")];

test("anonymizes documented names while preserving ordinary prose and incomplete answers", () => {
  const subjects = new Set(["Manager", "Create", "Info"]);
  assert.equal(anonymizeAnswer(pool[0]!.answer, subjects), "Tracks allocations.");
  assert.equal(anonymizeAnswer(pool[1]!.answer, subjects), "Returns an in-memory manager.");
  for (const text of ["Kubernetes schedules pods.", "The manager tracks allocations.", "Manager", "Manager tracks"]) {
    assert.equal(anonymizeAnswer(text, subjects), text);
  }
});

test("choices hide subject cues and never duplicate the correct answer", () => {
  for (const current of pool) {
    const choices = buildChoices(current, pool, 3, () => 0);
    assert.equal(choices.filter((choice) => choice.correct).length, 1);
    assert.equal(new Set(choices.map(({ text }) => text)).size, 3);
    assert(choices.every(({ text }) => !/^(Manager|Create|Info)\b/.test(text)));
  }
});

test("distractors vary across the deck instead of always using the first answers", () => {
  const cards = Array.from({ length: 12 }, (_, i) => card(`c${i}`, `Answer ${i} explains a distinct behavior.`));
  let seed = 0;
  const rng = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const sets = cards.slice(0, 4).map((current) => buildChoices(current, cards, 3, rng).filter((c) => !c.correct).map((c) => c.text).sort().join("|"));
  assert(new Set(sets).size > 1);
});

test("small decks still offer a valid correct answer", () => {
  assert.deepEqual(buildChoices(pool[0]!, [pool[0]!]), [{ text: "Tracks allocations.", correct: true }]);
});

test("normalized distractors retain source-card attribution in the current session model", () => {
  const [session] = dealSession(classify([pool[0]!]), pool);
  assert(session);
  for (const choice of session.choices.filter((choice) => !choice.correct)) {
    const source = confusedWith(choice, pool[0]!, pool);
    assert(source);
    assert.equal(session.confusable.get(choice.text)?.id, source.id);
  }
});
