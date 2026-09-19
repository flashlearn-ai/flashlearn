import assert from "node:assert/strict";
import test from "node:test";
import { anonymizeAnswer, buildChoices, classify, confusedWith, dealSession, type Card, type Presentation } from "../client/src/lib/deck.js";

function card(id: string, answer: string): Card {
  return { id, question: `What does \`${id}()\` do?`, answer,
    source: { path: `sample/${id}.ts`, sha: "unknown" }, createdAt: "now", updatedAt: "now" };
}
const pool = [card("Manager", "Manager tracks allocations."), card("Create", "Create returns an in-memory manager."), card("Info", "Info constructs a resource description.")];

/* A 117-card deck mixes function docs with prose and website copy, so drawing a
 * distractor from any card offered the marketing tagline as an answer to "what
 * does this function do". Matching the question's form keeps the options the
 * same kind of thing without narrowing them to one topic. */
test("distractors come from cards asking the same form of question", () => {
  const symbol = (id: string, answer: string): Card => ({ ...card(id, answer), question: `What does \`${id}()\` do?` });
  const prose = (id: string, answer: string): Card => ({ ...card(id, answer), question: `What does "${id}" cover?` });
  const mixed = [
    symbol("toYaml", "Serialize the JSON-compatible values returned by CLI query commands."),
    symbol("nextCard", "Request the card the scheduler says is due."),
    symbol("dueLabel", "Format a due date for the transcript."),
    prose("Local verification", "Agentic AI for compounding learning velocity across repositories."),
    prose("Release", "Contributor process docs describe how to work on the repository."),
  ];
  // Only the symbol cards have enough same-form peers to fill three choices.
  for (const current of mixed.slice(0, 3)) {
    for (const choice of buildChoices(current, mixed, 3, () => 0).filter((c) => !c.correct)) {
      const from = mixed.find((c) => anonymizeAnswer(c.answer) === choice.text || c.answer === choice.text);
      assert(from, `distractor "${choice.text}" came from no card`);
      assert(from.question.includes("do?"), `"${current.question}" was offered an answer to "${from.question}"`);
    }
  }
});

/* Hand-authored decks phrase every question differently, so a form can have no
 * peers at all. Preference must degrade to the wider pool rather than leave a
 * single-choice question, which is not a question. */
test("a deck of uniquely phrased questions still offers real choices", () => {
  const unique = ["Which package composes the implementations?", "Where does the CLI resolve state?", "How many cards per session?"]
    .map((question, i) => ({ ...card(`u${i}`, `Distinct answer number ${i}.`), question }));
  for (const current of unique) {
    const choices = buildChoices(current, unique, 3, () => 0);
    assert.equal(choices.length, 3, "a deck this size can still fill three choices");
    assert.equal(choices.filter((c) => c.correct).length, 1);
  }
});

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

/* Variety is the point: the same card can arrive as a question to answer or as
 * one to recall and rate, regardless of how well it is known. A forced mode is
 * honoured exactly, so the start screen can offer one or the other. */
test("a dealt session mixes recall and multiple choice, and honours a forced mode", () => {
  const deck = Array.from({ length: 12 }, (_, i) => card(`m${i}`, `Answer ${i} describes distinct behaviour.`));
  const modes = (presentation: Presentation) => new Set(dealSession(classify(deck), deck, presentation).map((entry) => entry.mode));
  assert.deepEqual(modes("choice"), new Set(["choice"]));
  assert.deepEqual(modes("reveal"), new Set(["reveal"]));
  assert.deepEqual(modes("mixed"), new Set(["choice", "reveal"]), "a mixed session must deal both kinds");
});

/* A card with no distractors cannot be asked as multiple choice. Presenting it
 * as one anyway shows a single option, which answers itself. */
test("a card that cannot be given choices is dealt as recall even when choice is forced", () => {
  const solo = [card("only", "The one answer in the deck.")];
  const [entry] = dealSession(classify(solo), solo, "choice");
  assert.equal(entry?.mode, "reveal");
});
