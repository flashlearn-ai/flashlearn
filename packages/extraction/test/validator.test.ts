import assert from "node:assert/strict";
import test from "node:test";
import type { GeneratedCard } from "../../../contracts/index.js";
import { questionOverlap, rejectionSummary, validateCards } from "../src/index.js";

function card(question: string, answer: string, path = "pkg/a.go"): GeneratedCard {
  return { question, answer, source: { path, sha: "abc" } };
}

/** A card long, specific, and distinct enough to pass every rule. */
function goodCard(question = "What does `ResourceInfoForPod()` do?", path = "pkg/a.go"): GeneratedCard {
  return card(
    question,
    "Constructs a state.PodResourceInfo holding container limits, memory-backed emptyDir volume caps, and pod-level resources.",
    path,
  );
}

test("keeps a card that is specific, long enough, and self-contained", () => {
  const { cards, rejected } = validateCards([goodCard()]);

  assert.equal(cards.length, 1);
  assert.deepEqual(rejected, []);
});

test("rejects locator questions", () => {
  const { cards, rejected } = validateCards([
    card(
      "Which file defines the `NewManager` func?",
      "`NewManager` is an exported func defined in `pkg/kubelet/allocation/allocation_manager.go`.",
    ),
  ]);

  assert.deepEqual(cards, []);
  assert.equal(rejected[0]?.reason, "locator question");
});

test("rejects answers too short to teach anything", () => {
  const { cards, rejected } = validateCards([card("What does `Sync()` do?", "Syncs.")]);

  assert.deepEqual(cards, []);
  assert.equal(rejected[0]?.reason, "answer too short to teach anything");
});

test("rejects an answer that only restates the question", () => {
  // A Go doc comment that re-spaces the identifier and adds nothing.
  const { cards, rejected } = validateCards([
    card(
      "What does `PodResourceAllocationManager` do?",
      "PodResourceAllocationManager manages pod resource allocation for resource allocation pods.",
    ),
  ]);

  assert.deepEqual(cards, []);
  assert.equal(rejected[0]?.reason, "answer restates the question");
});

test("rejects answers that lean on context the card omits", () => {
  for (const answer of [
    "This function is called by the loop described above whenever the pod spec changes materially.",
    "It returns the value computed earlier and stores it for the next reconcile pass to consume.",
    "The following steps describe how the allocation is persisted to the checkpoint file on disk.",
  ]) {
    const { cards, rejected } = validateCards([card("What does `Sync()` do?", answer)]);

    assert.deepEqual(cards, [], `expected rejection for: ${answer}`);
    assert.equal(rejected[0]?.reason, "answer depends on context the card omits");
  }
});

test("drops a question repeated across different files", () => {
  const question = "What does `IsInPlacePodVerticalScalingAllowed()` do?";
  const { cards, rejected } = validateCards([
    goodCard(question, "pkg/kubelet/a.go"),
    goodCard(question, "pkg/kubelet/b.go"),
    goodCard(question, "pkg/apis/c.go"),
  ]);

  assert.equal(cards.length, 1, "per-file deduplication cannot see cross-file repeats");
  assert.equal(cards[0]?.source.path, "pkg/kubelet/a.go", "the first occurrence is kept");
  assert.equal(rejected.length, 2);
  assert.equal(rejected[0]?.reason, "duplicate question across files");
});

test("treats questions differing only by case and spacing as duplicates", () => {
  const { cards } = validateCards([
    goodCard("What does `Run()` do?", "a.go"),
    goodCard("what  does  `Run()`  DO?", "b.go"),
  ]);

  assert.equal(cards.length, 1);
});

test("questionOverlap scores restatement high and explanation low", () => {
  const restated = questionOverlap(
    "What does `AllocationManager` do?",
    "AllocationManager manages allocation.",
  );
  const explained = questionOverlap(
    "What does `AllocationManager` do?",
    "Tracks which pods hold which node resources so the kubelet can admit or reject a resize request.",
  );

  assert.ok(restated > 0.6, `expected restatement above threshold, got ${restated}`);
  assert.ok(explained < 0.6, `expected explanation below threshold, got ${explained}`);
});

test("an empty answer scores as complete overlap rather than dividing by zero", () => {
  assert.equal(questionOverlap("What does `Run()` do?", ""), 1);
});

test("repairs a question whose subject is a truncated form of the answer's name", () => {
  // Real Kubernetes shape: `type Manager interface` in package `allocation`,
  // documented as "AllocationManager tracks ...". Asking about `Manager` is
  // meaningless in a repository with hundreds of them.
  const { cards, rejected } = validateCards([
    card("What does `Manager` do?", "AllocationManager tracks pod resource allocations."),
  ]);

  assert.deepEqual(rejected, [], "the doc comment is good; only the question was wrong");
  assert.equal(cards[0]?.question, "What does `AllocationManager` do?");
  assert.equal(cards[0]?.answer, "AllocationManager tracks pod resource allocations.");
});

test("repair preserves call parentheses and leaves unrelated subjects alone", () => {
  const { cards } = validateCards([
    card("What does `Sync()` do?", "PodSync reconciles the pod against its recorded allocation state."),
    card("What does `Run()` do?", "Starts the main loop and blocks until the supplied context is cancelled."),
  ]);

  assert.equal(cards[0]?.question, "What does `PodSync()` do?", "parentheses survive repair");
  assert.equal(cards[1]?.question, "What does `Run()` do?", "an unrelated leading identifier is not a rename");
});

test("a repaired question is still judged a restatement when it is one", () => {
  // Repair makes question and answer more similar, so the restatement rule
  // must run after it rather than on the original phrasing.
  const { cards, rejected } = validateCards([
    card("What does `Manager` do?", "AllocationManager manages allocations."),
  ]);

  assert.deepEqual(cards, []);
  assert.equal(rejected[0]?.reason, "answer restates the question");
});

test("rejectionSummary counts reasons and ranks them", () => {
  const { rejected } = validateCards([
    card("Which file defines the `A` func?", "`A` is an exported func defined in `a.go`."),
    card("Which file defines the `B` func?", "`B` is an exported func defined in `b.go`."),
    card("What does `C()` do?", "Short."),
  ]);

  assert.deepEqual(rejectionSummary(rejected), [
    { reason: "locator question", cards: 2 },
    { reason: "answer too short to teach anything", cards: 1 },
  ]);
});

test("reports every rejected card so filtering is never silent", () => {
  const input = [
    goodCard(),
    card("Which file defines the `A` func?", "`A` is an exported func defined in `a.go`."),
    card("What does `B()` do?", "Short."),
  ];

  const { cards, rejected } = validateCards(input);

  assert.equal(cards.length + rejected.length, input.length);
});
