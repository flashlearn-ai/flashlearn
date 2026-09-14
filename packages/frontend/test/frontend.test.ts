import assert from "node:assert/strict";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { createFlashLearnServer } from "../src/index.js";

const card = {
  id: "1",
  question: "Q",
  answer: "secret",
  source: { path: "a.ts", sha: "abc" },
  createdAt: "now",
  updatedAt: "now",
};

async function startServer() {
  const server = createFlashLearnServer({
    listCards: async () => [card],
    nextCard: async () => card,
    getCard: async () => card,
    submitReview: async () => ({
      cardId: "1",
      easeFactor: 2.5,
      intervalDays: 1,
      reviewCount: 1,
      correctCount: 1,
    }),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function closeServer(server: ReturnType<typeof createFlashLearnServer>) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()),
  );
}

class TestElement {
  textContent = "";
  hidden = false;
  disabled = false;
  readonly listeners = new Map<string, () => void>();

  addEventListener(event: string, listener: () => void) {
    this.listeners.set(event, listener);
  }

  click() {
    this.listeners.get("click")?.();
  }
}

test("next card response does not reveal the answer", async () => {
  const { server, url } = await startServer();
  const response = await fetch(`${url}/api/cards/next`);
  assert.deepEqual(await response.json(), { id: "1", question: "Q", source: { path: "a.ts", sha: "abc" } });
  await closeServer(server);
});

test("study page advances cards and keeps attribution paired with each card", async () => {
  const { server, url } = await startServer();
  const page = await fetch(url).then((response) => response.text());
  const script = page.match(/<script>([\s\S]*)<\/script>/)?.[1];
  assert.ok(script);

  const elements = new Map([
    ["#position", new TestElement()],
    ["#question", new TestElement()],
    ["#answer", new TestElement()],
    ["#source", new TestElement()],
    ["#reveal", new TestElement()],
    ["#navigation", new TestElement()],
    ["#previous", new TestElement()],
    ["#next", new TestElement()],
  ]);
  const cards = [
    { ...card, id: "1", question: "Q1", answer: "A1", source: { path: "one.ts", sha: "sha-one" } },
    { ...card, id: "2", question: "Q2", answer: "A2", source: { path: "two.ts", sha: "sha-two" } },
    { ...card, id: "3", question: "Q3", answer: "A3", source: { path: "three.ts", sha: "sha-three" } },
  ];

  runInNewContext(script, {
    document: {
      querySelector: (selector: string) => elements.get(selector),
    },
    fetch: async () => ({
      ok: true,
      json: async () => cards,
    }),
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(elements.get("#question")?.textContent, "Q1");
  assert.equal(elements.get("#source")?.textContent, "Source: one.ts @ sha-one");
  assert.equal(elements.get("#answer")?.hidden, true);
  assert.equal(elements.get("#previous")?.disabled, true);

  elements.get("#reveal")?.click();
  assert.equal(elements.get("#answer")?.textContent, "A1");
  assert.equal(elements.get("#answer")?.hidden, false);

  elements.get("#next")?.click();
  assert.equal(elements.get("#question")?.textContent, "Q2");
  assert.equal(elements.get("#source")?.textContent, "Source: two.ts @ sha-two");
  assert.equal(elements.get("#answer")?.hidden, true);

  elements.get("#next")?.click();
  assert.equal(elements.get("#question")?.textContent, "Q3");
  assert.equal(elements.get("#source")?.textContent, "Source: three.ts @ sha-three");
  assert.equal(elements.get("#next")?.disabled, true);

  await closeServer(server);
});

test("study page uses ordered cards without review or due-card requests", async () => {
  const { server, url } = await startServer();
  const response = await fetch(url);
  const page = await response.text();

  assert.equal(response.status, 200);
  assert.ok(page.includes("fetch('/api/cards')"));
  assert.ok(!page.includes("fetch('/api/cards/next')"));
  assert.ok(!page.includes("fetch('/api/review')"));
  assert.match(page, /Reveal answer/);
  assert.match(page, />Previous</);
  assert.match(page, />Next</);
  assert.match(page, /card\.source\.path/);
  assert.match(page, /card\.source\.sha/);
  assert.match(page, /answer\.hidden = true/);

  await closeServer(server);
});
