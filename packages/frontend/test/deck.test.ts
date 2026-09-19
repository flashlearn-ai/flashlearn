import assert from "node:assert/strict";
import test from "node:test";
import type { Card } from "../../../contracts/index.js";
import { SESSION_LIMIT, buildChoices, buildSet, classify, confusedWith, dealSession, dueLabel, groupByTopic, runsOf, scoreOf } from "../client/src/lib/deck.js";

function card(id: string, topic: string, answer: string, path = `packages/${topic}/src/x.ts`): Card {
  return { id, question: `Q ${id}`, answer, source: { path, sha: "abc1234" }, tags: [topic], createdAt: "now", updatedAt: "now" };
}

function untagged(id: string, path: string): Card {
  return { id, question: `Q ${id}`, answer: `answer ${id}`, source: { path, sha: "abc1234" }, createdAt: "now", updatedAt: "now" };
}

const DECK = [card("a", "cli", "one"), card("b", "storage", "two"), card("c", "cli", "three"), card("d", "storage", "four")];

test("a session groups each topic into one contiguous run", () => {
  const session = buildSet(classify(DECK), ["cli", "storage"]);
  assert.deepEqual(session.map((c) => c.id), ["a", "c", "b", "d"]);

  const runs = runsOf(session);
  assert.deepEqual(runs.map((run) => [run.id, run.start, run.cards.length]), [["cli", 0, 2], ["storage", 2, 2]]);
});

test("run order follows the order topics were selected", () => {
  const session = buildSet(classify(DECK), ["storage", "cli"]);
  assert.deepEqual(runsOf(session).map((run) => run.id), ["storage", "cli"]);
});

test("an unselected topic contributes no cards", () => {
  assert.deepEqual(buildSet(classify(DECK), ["cli"]).map((c) => c.id), ["a", "c"]);
  assert.deepEqual(buildSet(classify(DECK), []), []);
});

test("a session is capped so a large repository stays reviewable", () => {
  const big = Array.from({ length: 900 }, (_, i) => card(`big-${i}`, "cli", `answer ${i}`));
  assert.equal(buildSet(classify(big), ["cli"]).length, SESSION_LIMIT);
});

test("a dwarfed topic still appears when another topic is far larger", () => {
  const lopsided = [...Array.from({ length: 900 }, (_, i) => card(`big-${i}`, "cli", `answer ${i}`)), card("small", "storage", "only one")];
  const runs = runsOf(buildSet(classify(lopsided), ["cli", "storage"]));
  assert.deepEqual(runs.map((run) => run.id), ["cli", "storage"]);
  assert.equal(runs[1]!.cards.length, 1, "the smaller topic was crowded out");
  assert.equal(runs[0]!.cards.length, SESSION_LIMIT - 1);
});

test("a deck smaller than the cap is used whole", () => {
  assert.equal(buildSet(classify(DECK), ["cli", "storage"]).length, 4);
});

test("a miss names the card its distractor was borrowed from", () => {
  const chosen = { text: "two", correct: false };
  assert.equal(confusedWith(chosen, DECK[0]!, DECK)?.id, "b");
});

test("a hit has nothing to contrast, and an unknown distractor resolves to nothing", () => {
  assert.equal(confusedWith({ text: "one", correct: true }, DECK[0]!, DECK), null);
  assert.equal(confusedWith({ text: "absent", correct: false }, DECK[0]!, DECK), null);
});

test("a card is never confused with itself", () => {
  assert.equal(confusedWith({ text: "one", correct: false }, DECK[0]!, DECK), null);
});

/** The interval belongs to the learning package. The client only describes the
 *  date it was handed, so a change to the schedule cannot leave the UI lying. */
test("a scheduled date is described, never computed", () => {
  const now = new Date("2026-09-16T10:00:00Z");
  assert.equal(dueLabel("2026-09-16T10:00:00Z", now), "today");
  assert.equal(dueLabel("2026-09-17T04:00:00Z", now), "tomorrow");
  assert.equal(dueLabel("2026-09-19T10:00:00Z", now), "in 3 days");
  assert.equal(dueLabel("2026-09-15T10:00:00Z", now), "today", "an overdue card is due now");
});

test("a card with no scheduled date claims none", () => {
  assert.equal(dueLabel(null), null);
  assert.equal(dueLabel(undefined), null);
  assert.equal(dueLabel("not a date"), null);
});

test("a tag from extraction wins over the path", () => {
  assert.equal(classify([card("t", "learning", "x")])[0]!.topic.id, "learning");
});

/** A deck generated from a subdirectory sits entirely under one folder. Grouping
 *  on the first segment put every card in a single topic; grouping on the first
 *  segment that differs is what makes an arbitrary repository usable. */
test("a deck under a single root is split into the directories beneath it", () => {
  const deck = [
    untagged("s1", "scheduler/framework/plugins/volumezone/volume_zone.go"),
    untagged("s2", "scheduler/framework/runtime/framework.go"),
    untagged("s3", "scheduler/apis/config/register.go"),
    untagged("s4", "scheduler/metrics/metrics.go"),
  ];
  assert.deepEqual(groupByTopic(classify(deck)).map((g) => [g.label, g.total]), [["Apis", 1], ["Framework", 2], ["Metrics", 1]]);
});

test("a deck spanning several roots keeps the small ones and splits the dominant one", () => {
  const deck = [
    untagged("p1", "packages/cli/src/cli.ts"),
    untagged("p2", "packages/storage/src/json.ts"),
    untagged("p3", "packages/learning/src/schedule.ts"),
    untagged("c1", "contracts/index.d.ts"),
  ];
  // `contracts/` is small, so it survives untouched while `packages/` is opened up.
  assert.deepEqual(groupByTopic(classify(deck)).map((g) => g.label), ["CLI", "Contracts", "Learning", "Storage"]);
});

test("a directory with a single child is descended through, not abandoned", () => {
  const deck = [untagged("x", "scheduler/framework/a.go"), untagged("y", "scheduler/framework/b.go")];
  assert.deepEqual(groupByTopic(classify(deck)).map((g) => g.label), ["Framework"]);
});

/** The shape `flashlearn generate --subpath packages/cli` produces: the whole
 *  deck sits under a chain of single directories before it branches. Stopping at
 *  the first narrow link left every card in one topic. */
test("a deck scoped to a subdirectory splits below the chain it shares", () => {
  const deck = [
    ...Array.from({ length: 30 }, (_, i) => untagged(`s${i}`, `packages/cli/src/f${i}.ts`)),
    ...Array.from({ length: 20 }, (_, i) => untagged(`t${i}`, `packages/cli/test/f${i}.ts`)),
    ...Array.from({ length: 10 }, (_, i) => untagged(`d${i}`, `packages/cli/docs/f${i}.md`)),
  ];
  assert.deepEqual(groupByTopic(classify(deck)).map((g) => [g.label, g.total]), [["Docs", 10], ["Src", 30], ["Test", 20]]);
});

test("a directory holding only files cannot be split further", () => {
  const deck = [untagged("a", "notes/one.md"), untagged("b", "notes/two.md")];
  assert.deepEqual(groupByTopic(classify(deck)).map((g) => g.label), ["Notes"]);
});

/** A session is a subset, and a subset shares a deeper path prefix than the deck
 *  it came from. Deriving topics from the subset regrouped it into topics the
 *  chooser never offered. Carrying the topic on the card removes the whole class
 *  of bug: there is no longer a second place for it to be decided. */
test("a session keeps the topics the deck was grouped by", () => {
  const deck = classify([
    untagged("c1", "cmd/a.go"), untagged("c2", "cmd/b.go"),
    untagged("p1", "pkg/x/1.go"), untagged("p2", "pkg/y/2.go"),
  ]);
  assert.deepEqual(groupByTopic(deck).map((g) => g.label), ["Cmd", "Pkg"]);

  const session = buildSet(deck, ["pkg"], SESSION_LIMIT);
  assert.deepEqual(session.map((c) => c.id), ["p1", "p2"]);
  // Classified alone, this subset would become "X" and "Y".
  assert.deepEqual(classify(session).map((c) => c.topic.label), ["X", "Y"]);
  // Carried from the deck, it stays one run.
  assert.deepEqual(runsOf(session).map((run) => run.label), ["Pkg"]);
});

test("a file at the repository root has no directory to group by", () => {
  assert.equal(classify([untagged("r", "README.md")])[0]!.topic.id, "general");
});

/** Input is not always a git repository, and not always a repository at all.
 *  A plain folder or a single document has to behave. */
test("a flat folder of loose files groups into one general topic", () => {
  const deck = [untagged("n", "notes.md"), untagged("u", "util.js")];
  assert.deepEqual(groupByTopic(classify(deck)).map((g) => [g.label, g.total]), [["General", 2]]);
});

test("a deck too small to supply a wrong answer offers no false choice", () => {
  const only = [untagged("solo", "readme.md")];
  const choices = buildChoices(only[0]!, only);
  assert.equal(choices.length, 1, "one option is a test nobody can fail");
  assert.equal(choices[0]!.correct, true);
});

test("distractors never repeat the correct answer", () => {
  const deck = [untagged("a", "a.md"), untagged("b", "b.md"), untagged("c", "c.md")];
  const duplicate = { ...deck[1]!, id: "dup", answer: deck[0]!.answer };
  const choices = buildChoices(deck[0]!, [...deck, duplicate]);
  const texts = choices.map((c) => c.text);
  assert.equal(new Set(texts).size, texts.length);
  assert.equal(choices.filter((c) => c.correct).length, 1);
});

test("a repeated topic id does not take two turns or emit its cards twice", () => {
  const ids = buildSet(classify(DECK), ["cli", "cli", "storage"]).map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "a card appeared twice in one session");
  assert.deepEqual(ids, ["a", "c", "b", "d"]);
});

/** A topic larger than one session was otherwise unreachable past its first
 *  `SESSION_LIMIT` cards, and repeating a session re-graded the same ones. */
test("successive sessions reach further into a topic than the first", () => {
  const big = Array.from({ length: 40 }, (_, i) => untagged(`c${i}`, `pkg/a/f${i}.ts`));
  const [topic] = groupByTopic(classify(big));
  assert(topic, "the deck produced no topic to study");
  const first = buildSet(classify(big), [topic.id], SESSION_LIMIT, 0).map((c) => c.id);
  const second = buildSet(classify(big), [topic.id], SESSION_LIMIT, 1).map((c) => c.id);

  assert.equal(first.length, SESSION_LIMIT);
  assert.notDeepEqual(first, second, "a second session repeated the first");
  assert.equal(first.filter((id) => second.includes(id)).length, 0, "sessions should advance by cards dealt, not one card");
  assert.equal(new Set(second).size, second.length, "a session repeated a card within itself");
});

test("more selected topics than slots do not starve later topics", () => {
  const deck = classify(Array.from({ length: 29 }, (_, i) => card(`c${i}`, `topic-${i}`, `answer ${i}`)));
  const topics = deck.map((c) => c.topic.id);
  const reached = new Set<string>();
  for (let session = 0; session < 3; session += 1) {
    const set = buildSet(deck, topics, SESSION_LIMIT, session);
    assert.equal(set.length, SESSION_LIMIT);
    for (const entry of set) reached.add(entry.topic.id);
  }
  assert.equal(reached.size, topics.length);
});

test("per-topic cursors avoid overlap even when selected topics change", () => {
  const deck = classify(Array.from({ length: 60 }, (_, i) => card(`c${i}`, i < 30 ? "a" : "b", `answer ${i}`)));
  const cursors = new Map<string, number>();
  const first = buildSet(deck, ["a", "b"], SESSION_LIMIT, 0, cursors);
  for (const entry of first) cursors.set(entry.topic.id, (cursors.get(entry.topic.id) ?? 0) + 1);
  const second = buildSet(deck, ["a"], SESSION_LIMIT, 1, cursors);
  assert.equal(second.filter((entry) => first.some((previous) => previous.id === entry.id)).length, 0);
  const newSelection = buildSet(deck, ["b"], SESSION_LIMIT, 5, new Map([["a", 12]]));
  assert.equal(newSelection[0]?.id, "c30", "a newly selected topic starts at its first unseen card");
});

test("rotation past the end of a topic wraps without repeating within a session", () => {
  const small = Array.from({ length: 5 }, (_, i) => untagged(`s${i}`, `pkg/a/f${i}.ts`));
  const [topic] = groupByTopic(classify(small));
  assert(topic);
  const ids = buildSet(classify(small), [topic.id], SESSION_LIMIT, 3).map((c) => c.id);
  assert.equal(ids.length, 5, "every card in the topic is offered");
  assert.equal(new Set(ids).size, 5);
});

/** Five arrays indexed by `step` had to stay the same length and order, an
 *  invariant nothing enforced and every reader re-derived. */
test("dealing a session pairs each card with its choices and what it is confusable with", () => {
  const deck = classify(DECK);
  const dealt = dealSession(buildSet(deck, ["cli", "storage"]), DECK);

  assert.equal(dealt.length, 4);
  for (const entry of dealt) {
    assert.equal(entry.answer, null);
    assert.equal(entry.grade, null);
    assert.equal(entry.outcome, null);
    assert.ok(entry.choices.some((c) => c.correct), "no correct choice was offered");
    assert.equal(entry.choices.filter((c) => c.correct).length, 1);
  }

  const [first] = dealt;
  assert(first);
  const wrong = first.choices.find((c) => !c.correct);
  assert(wrong, "the deck was too small to offer a wrong choice");
  assert.equal(first.confusable.get(wrong.text)?.answer, wrong.text, "the confusable card does not answer that choice");
  const right = first.choices.find((c) => c.correct)!;
  assert.equal(first.confusable.get(right.text), undefined, "the correct choice is not a confusion");
});

test("a run is scored from the session records", () => {
  const deck = classify(DECK);
  const dealt = dealSession(buildSet(deck, ["cli"]), DECK);
  const [run] = runsOf(dealt.map((d) => d.card));
  assert(run);

  assert.equal(scoreOf(run, dealt), 0, "nothing answered yet");
  dealt[0]!.answer = { text: "one", correct: true };
  dealt[1]!.answer = { text: "x", correct: false };
  assert.equal(scoreOf(run, dealt), 1);
});

/** A deck that cannot offer a wrong choice shows the answer rather than asking.
 *  Such a card is completed by grading it, not by choosing. */
test("a reveal-only card has a correct choice to record on completion", () => {
  const solo = classify([untagged("only", "readme.md")]);
  const [entry] = dealSession(buildSet(solo, [solo[0]!.topic.id]), solo);
  assert(entry);
  assert.equal(entry.choices.length, 1, "a lone card cannot be a quiz");
  assert.equal(entry.choices.find((c) => c.correct)?.text, entry.card.answer);
});

/* A recall card is never chosen from options, so grading one used to record the
 * correct choice as though the learner had picked it. Every score then counted
 * it right, whatever the learner said. The rating is the only evidence there is. */
test("a recall card is scored by its rating, not by an answer nobody chose", () => {
  const deck = classify(DECK);
  const dealt = dealSession(buildSet(deck, ["cli"]), DECK, "reveal");
  const [run] = runsOf(dealt.map((d) => d.card));
  assert(run);
  assert(dealt.every((entry) => entry.mode === "reveal"), "this session must be dealt as recall");

  assert.equal(scoreOf(run, dealt), 0, "nothing rated yet");
  dealt[0]!.grade = "incorrect";
  dealt[1]!.grade = "easy";
  assert.equal(scoreOf(run, dealt), 1, "only the recalled card counts");
});
