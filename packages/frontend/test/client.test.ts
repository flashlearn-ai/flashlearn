import assert from "node:assert/strict";
import test from "node:test";
import { createApiClient } from "../ui/client.js";
import { createDemoClient } from "../ui/demo-client.js";

test("API client encodes IDs and posts the locked review payload", async () => {
  const calls: { path: string; options?: RequestInit }[] = [];
  const client = createApiClient(async (path, options) => {
    calls.push({ path: String(path), options });
    return new Response("{}", { headers: { "content-type": "application/json" } });
  });
  await client.reveal("a/b c");
  await client.review("id", "hard");
  assert.equal(calls[0]?.path, "/api/cards/a%2Fb%20c");
  assert.equal(calls[1]?.options?.body, '{"cardId":"id","result":"hard"}');
});

test("API client distinguishes no due card from server failure", async () => {
  assert.equal(await createApiClient(async () => new Response("", { status: 404 })).next(), null);
  await assert.rejects(() => createApiClient(async () => new Response('{"error":"Offline"}', { status: 500 })).next(), /Offline/);
});

test("demo reviews advance a private session queue without pretending to schedule", async () => {
  const client = createDemoClient();
  const first = await client.next();
  assert(first);
  assert(!("answer" in first));
  assert((await client.reveal(first.id)).answer);
  assert.equal(await client.review(first.id, "incorrect"), null);
  assert.notEqual((await client.next())?.id, first.id);
  assert.equal((await createDemoClient().next())?.id, first.id);
});
