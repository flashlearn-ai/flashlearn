import assert from "node:assert/strict";
import test from "node:test";
import { deckSource, fetchDeck, parseDeck } from "../client/src/deckSource.js";

const card = {
  id: "k8s-0",
  question: "What does `AllocationManager` do?",
  answer: "AllocationManager tracks pod resource allocations.",
  source: { path: "pkg/kubelet/allocation/allocation_manager.go", sha: "b3798a0" },
  createdAt: "2026-09-16T00:00:00Z",
  updatedAt: "2026-09-16T00:00:00Z",
};

test("parseDeck accepts cards matching the locked contract", () => {
  assert.deepEqual(parseDeck([card]), [card]);
});

test("parseDeck rejects a payload that is not an array", () => {
  assert.throws(() => parseDeck({ error: "not found" }), /array of cards/);
});

test("parseDeck drops malformed entries rather than rendering blank cards", () => {
  const deck = parseDeck([card, { id: "bad" }, null, { ...card, id: "k8s-1" }]);

  assert.deepEqual(deck.map((c) => c.id), ["k8s-0", "k8s-1"]);
});

test("parseDeck fails when nothing usable survives", () => {
  assert.throws(() => parseDeck([{ id: "bad" }]), /no usable cards/);
});

test("parseDeck accepts an empty deck, because generating nothing is valid", () => {
  assert.deepEqual(parseDeck([]), []);
});

test("deckSource defaults to the bundled fixture", async () => {
  for (const setting of [undefined, "", "  ", "fixture"]) {
    const cards = await deckSource(setting)();
    assert.ok(cards.length > 0, `expected fixture cards for ${JSON.stringify(setting)}`);
  }
});

test("deckSource reads the API when configured", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify([card]), { status: 200 });
  });

  const cards = await deckSource("api")();

  assert.deepEqual(calls, ["/api/cards"]);
  assert.equal(cards[0]?.question, "What does `AllocationManager` do?");
});

test("deckSource treats any other value as a deck URL", async (t) => {
  const calls: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify([card]), { status: 200 });
  });

  await deckSource("http://localhost:9999/deck.json")();

  assert.deepEqual(calls, ["http://localhost:9999/deck.json"]);
});

test("fetchDeck reports the status rather than failing silently", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("nope", { status: 503 }));

  await assert.rejects(() => fetchDeck("/api/cards"), /503/);
});
