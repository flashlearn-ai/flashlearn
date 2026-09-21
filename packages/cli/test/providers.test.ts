import assert from "node:assert/strict";
import test from "node:test";
import type { FetchLike } from "@flashlearn/extraction";
import { AnthropicExtractor, CopilotExtractor } from "../src/providers.js";

const source = { path: "src/server.ts", sha: "abc", content: "export function serve() { return true; }" };

test("CopilotExtractor prompts for JSON cards and stamps trusted attribution", async () => {
  let prompt = "";
  const extractor = new CopilotExtractor(async (value) => {
    prompt = value;
    return JSON.stringify({ cards: [{ question: "How does serving begin?", answer: "The exported serve function returns true to indicate startup." }] });
  });
  const cards = await extractor.extract(source);
  assert.match(prompt, /Reply with JSON only/);
  assert.match(prompt, /src\/server\.ts/);
  assert.deepEqual(cards[0]?.source, { path: "src/server.ts", sha: "abc" });
});

test("CopilotExtractor skips unsupported files and tolerates CLI failure", async () => {
  let calls = 0;
  const extractor = new CopilotExtractor(async () => { calls += 1; return null; });
  assert.deepEqual(await extractor.extract({ ...source, path: "README.md" }), []);
  assert.deepEqual(await extractor.extract(source), []);
  assert.equal(calls, 1);
});

test("AnthropicExtractor uses the Messages API and attributes parsed cards", async () => {
  let request: RequestInit | undefined;
  const fetchImpl: FetchLike = async (_url, init) => {
    request = init;
    return {
      ok: true,
      json: async () => ({ content: [{ type: "text", text: JSON.stringify({ cards: [{ question: "What happens?", answer: "The implementation returns a successful result to its caller." }] }) }] }),
    } as Response;
  };
  const cards = await new AnthropicExtractor("key", "claude-test", fetchImpl).extract(source);
  const headers = request?.headers as Record<string, string>;
  const body = JSON.parse(String(request?.body)) as { model: string };
  assert.equal(headers["x-api-key"], "key");
  assert.equal(body.model, "claude-test");
  assert.deepEqual(cards[0]?.source, { path: "src/server.ts", sha: "abc" });
});
