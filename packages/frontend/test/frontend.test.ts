import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createFlashLearnServer, FrontendService, type FrontendServices } from "../src/index.js";
import { DEMO_CARDS } from "./fixtures/demo.js";

const card = DEMO_CARDS[0]!;
const state = { cardId: card.id, easeFactor: 2.5, intervalDays: 8, reviewCount: 1, correctCount: 1, nextReview: "2030-01-01T00:00:00.000Z" };

async function serve(t: import("node:test").TestContext, options: Partial<FrontendServices> = {}, webRoot?: string) {
  const reviews: unknown[] = [];
  const services: FrontendServices = {
    listCards: async () => [card], nextCard: async () => card,
    getCard: async (id) => id === card.id ? card : null,
    submitReview: async (cardId, result) => { reviews.push({ cardId, result }); return state; },
    ...options,
  };
  const server = webRoot ? new FrontendService(webRoot).createServer(services) : createFlashLearnServer(services);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  t.after(() => new Promise<void>((done, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : done());
  }));
  const address = server.address();
  assert(address && typeof address !== "string");
  return { request: (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${address.port}${path}`, init), reviews };
}

test("lists cards, hides answers until reveal, and returns 404 for missing cards", async (t) => {
  const { request } = await serve(t);
  assert.deepEqual(await (await request("/api/cards")).json(), [card]);
  assert.deepEqual(await (await request("/api/cards/next")).json(), { id: card.id, question: card.question, source: card.source });
  assert.deepEqual(await (await request(`/api/cards/${card.id}`)).json(), card);
  assert.equal((await request("/api/cards/missing")).status, 404);
});

test("an empty due queue returns the locked 404 response", async (t) => {
  const { request } = await serve(t, { nextCard: async () => null });
  const response = await request("/api/cards/next");
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "No card is due" });
});

test("all four review results are delegated and return the service schedule", async (t) => {
  const { request, reviews } = await serve(t);
  for (const result of ["easy", "hard", "correct", "incorrect"]) {
    const payload = { cardId: card.id, result };
    const response = await request("/api/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), state);
    assert.deepEqual(reviews.at(-1), payload);
  }
});

test("invalid bodies and missing cards never submit a review", async (t) => {
  const { request, reviews } = await serve(t);
  for (const body of ["null", "[]", "{", "{}", JSON.stringify({ cardId: 1, result: "easy" }), JSON.stringify({ cardId: card.id, result: "wrong" })]) {
    assert.equal((await request("/api/review", { method: "POST", headers: { "content-type": "application/json" }, body })).status, 400);
  }
  assert.equal((await request("/api/review", { method: "POST", body: "{}" })).status, 415);
  assert.equal((await request("/api/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: "missing", result: "easy" }) })).status, 404);
  assert.deepEqual(reviews, []);
});

test("service errors are surfaced without leaking filesystem details", async (t) => {
  const { request } = await serve(t, { submitReview: async () => { throw new Error("/private/project/review.json unavailable"); } });
  const response = await request("/api/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: card.id, result: "easy" }) });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Unable to complete request" });
});

test("oversized reviews are rejected before service invocation", async (t) => {
  const { request, reviews } = await serve(t);
  const response = await request("/api/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: "x".repeat(20_000), result: "easy" }) });
  assert.equal(response.status, 413);
  assert.deepEqual(reviews, []);
});

test("missing web build gives an actionable error while API remains available", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-no-web-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const { request } = await serve(t, {}, join(root, "absent"));
  const response = await request("/");
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /npm run build/);
  assert.equal((await request("/api/cards")).status, 200);
});

test("serves static assets only within the UI root, including symlink protection", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-web-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const web = join(root, "web");
  await mkdir(web);
  await writeFile(join(web, "index.html"), "<!doctype html><h1>FlashLearn</h1>");
  await writeFile(join(web, "app.js"), "console.log('ui')");
  await writeFile(join(root, "private.html"), "private");
  await symlink(join(root, "private.html"), join(web, "leak.html"));
  const { request } = await serve(t, {}, web);
  assert.equal(await (await request("/")).text(), await readFile(join(web, "index.html"), "utf8"));
  assert.match((await request("/app.js")).headers.get("content-type")!, /javascript/);
  assert.equal((await request("/leak.html")).status, 404);
  assert.equal((await request("/..%2fprivate.html")).status, 404);
  assert.equal((await request("/missing.js")).status, 404);
  assert.equal((await request("/api/unknown")).status, 404);
  assert.equal(await (await request("/", { method: "HEAD" })).text(), "");
  assert.match(new FrontendService(web).renderPage(), /FlashLearn/);
});
