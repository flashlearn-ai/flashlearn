import assert from "node:assert/strict";
import test from "node:test";
import { EndpointExtractor, ENDPOINT_ENV, endpointConfigFromEnv, type FetchLike } from "../src/endpoint.js";
import { defaultExtractor, deterministicExtractor } from "../src/workstream.js";

const config = { url: "https://models.example/chat/completions", model: "test-model" };
const source = { path: "pkg/server.go", sha: "sha1", content: "func Serve() error { return nil }\n" };

/** A fetch stub returning one assistant message, recording what was sent. */
function replyWith(content: string, status = 200): { fetch: FetchLike; calls: RequestInit[] } {
  const calls: RequestInit[] = [];
  const fetchImpl: FetchLike = async (_url, init) => {
    calls.push(init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => ({ choices: [{ message: { content } }] }),
    } as Response;
  };
  return { fetch: fetchImpl, calls };
}

const oneCard = JSON.stringify({ cards: [{ question: "What does Serve do?", answer: "Starts the listener." }] });

test("EndpointExtractor turns a model reply into attributed cards", async () => {
  const { fetch } = replyWith(oneCard);

  const cards = await new EndpointExtractor(config, fetch).extract(source);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.question, "What does Serve do?");
  assert.equal(cards[0]?.answer, "Starts the listener.");
  assert.deepEqual(cards[0]?.source, { path: "pkg/server.go", sha: "sha1" });
});

test("EndpointExtractor stamps attribution from the file, not the model", async () => {
  const hostile = JSON.stringify({
    cards: [{ question: "Q", answer: "A", source: { path: "attacker/evil.go", sha: "bad" } }],
  });
  const { fetch } = replyWith(hostile);

  const cards = await new EndpointExtractor(config, fetch).extract(source);

  assert.deepEqual(cards[0]?.source, { path: "pkg/server.go", sha: "sha1" });
});

test("EndpointExtractor parses a fenced JSON reply", async () => {
  const { fetch } = replyWith("Here you go:\n```json\n" + oneCard + "\n```\n");

  const cards = await new EndpointExtractor(config, fetch).extract(source);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.question, "What does Serve do?");
});

test("EndpointExtractor yields no cards for unparseable or empty replies", async () => {
  const extractor = (content: string) => new EndpointExtractor(config, replyWith(content).fetch);

  assert.deepEqual(await extractor("not json at all").extract(source), []);
  assert.deepEqual(await extractor(JSON.stringify({ cards: [] })).extract(source), []);
  assert.deepEqual(await extractor(JSON.stringify({ cards: "wrong type" })).extract(source), []);
});

test("EndpointExtractor drops entries missing a question or answer", async () => {
  const mixed = JSON.stringify({
    cards: [
      { question: "Good?", answer: "Yes." },
      { question: "  ", answer: "Blank question." },
      { question: "No answer?", answer: "" },
      { question: 42, answer: "Wrong type." },
    ],
  });
  const { fetch } = replyWith(mixed);

  const cards = await new EndpointExtractor(config, fetch).extract(source);

  assert.deepEqual(cards.map((card) => card.question), ["Good?"]);
});

test("EndpointExtractor returns no cards when the endpoint fails", async () => {
  const { fetch } = replyWith(oneCard, 500);

  assert.deepEqual(await new EndpointExtractor(config, fetch).extract(source), []);
});

test("EndpointExtractor survives a thrown request without aborting the run", async () => {
  const failing: FetchLike = async () => {
    throw new Error("network down");
  };

  assert.deepEqual(await new EndpointExtractor(config, failing).extract(source), []);
});

test("EndpointExtractor skips Markdown and empty files without calling the endpoint", async () => {
  const { fetch, calls } = replyWith(oneCard);
  const extractor = new EndpointExtractor(config, fetch);

  assert.deepEqual(await extractor.extract({ ...source, path: "README.md" }), []);
  assert.deepEqual(await extractor.extract({ ...source, content: "   \n" }), []);
  assert.equal(calls.length, 0, "no request for skipped files");
});

test("EndpointExtractor caps the number of cards per file", async () => {
  const many = JSON.stringify({
    cards: Array.from({ length: 10 }, (_, index) => ({ question: `Q${index}`, answer: `A${index}` })),
  });
  const { fetch } = replyWith(many);

  const cards = await new EndpointExtractor({ ...config, maxCardsPerFile: 3 }, fetch).extract(source);

  assert.equal(cards.length, 3);
});

test("EndpointExtractor sends a bearer token by default", async () => {
  const { fetch, calls } = replyWith(oneCard);

  await new EndpointExtractor({ ...config, apiKey: "secret" }, fetch).extract(source);

  const headers = calls[0]?.headers as Record<string, string>;
  assert.equal(headers["authorization"], "Bearer secret");
});

test("EndpointExtractor supports a raw key header for Azure OpenAI", async () => {
  const { fetch, calls } = replyWith(oneCard);

  await new EndpointExtractor({ ...config, apiKey: "secret", authHeader: "api-key" }, fetch).extract(source);

  const headers = calls[0]?.headers as Record<string, string>;
  assert.equal(headers["api-key"], "secret", "raw key, not Bearer-prefixed");
  assert.ok(!("authorization" in headers), "no Authorization header when one is named");
});

test("EndpointExtractor omits auth headers when no key is configured", async () => {
  const { fetch, calls } = replyWith(oneCard);

  await new EndpointExtractor(config, fetch).extract(source);

  const headers = calls[0]?.headers as Record<string, string>;
  assert.deepEqual(Object.keys(headers), ["content-type"]);
});

test("EndpointExtractor sends the file path and model in the request", async () => {
  const { fetch, calls } = replyWith(oneCard);

  await new EndpointExtractor(config, fetch).extract(source);

  const body = JSON.parse(String(calls[0]?.body)) as { model: string; messages: { content: string }[] };
  assert.equal(body.model, "test-model");
  assert.match(body.messages[1]?.content ?? "", /pkg\/server\.go/);
});

test("endpointConfigFromEnv requires both a URL and a model", () => {
  assert.equal(endpointConfigFromEnv({}), null);
  assert.equal(endpointConfigFromEnv({ FLASHLEARN_ENDPOINT_URL: "https://x" }), null);
  assert.equal(endpointConfigFromEnv({ FLASHLEARN_ENDPOINT_MODEL: "m" }), null);
  assert.equal(endpointConfigFromEnv({ FLASHLEARN_ENDPOINT_URL: "  ", FLASHLEARN_ENDPOINT_MODEL: "m" }), null);
});

test("endpointConfigFromEnv reads optional auth settings", () => {
  const parsed = endpointConfigFromEnv({
    FLASHLEARN_ENDPOINT_URL: "https://x/chat",
    FLASHLEARN_ENDPOINT_MODEL: "gpt-4o",
    FLASHLEARN_ENDPOINT_API_KEY: "key",
    FLASHLEARN_ENDPOINT_AUTH_HEADER: "api-key",
  });

  assert.deepEqual(parsed, {
    url: "https://x/chat",
    model: "gpt-4o",
    apiKey: "key",
    authHeader: "api-key",
  });
});

test("defaultExtractor stays deterministic when no endpoint is configured", async () => {
  delete process.env[ENDPOINT_ENV.url];
  delete process.env[ENDPOINT_ENV.model];

  const cards = await defaultExtractor().extract({
    path: "pkg/a.go",
    sha: "s",
    content: "// Serve starts the listener.\nfunc Serve() {}\n",
  });

  assert.deepEqual(cards.map((card) => card.question), ["What does `Serve()` do?"]);
});

test("defaultExtractor selects the endpoint for code once configured", async () => {
  process.env[ENDPOINT_ENV.url] = "https://models.example/chat/completions";
  process.env[ENDPOINT_ENV.model] = "test-model";

  try {
    const markdown = await defaultExtractor().extract({
      path: "README.md",
      sha: "s",
      content: "# Overview\nProse answer.\n",
    });

    // Markdown stays deterministic even when an endpoint is configured.
    assert.deepEqual(markdown.map((card) => card.question), ['What does "Overview" cover?']);
  } finally {
    delete process.env[ENDPOINT_ENV.url];
    delete process.env[ENDPOINT_ENV.model];
  }
});

test("deterministicExtractor never consults an endpoint", async () => {
  process.env[ENDPOINT_ENV.url] = "https://models.example/chat/completions";
  process.env[ENDPOINT_ENV.model] = "test-model";

  try {
    const cards = await deterministicExtractor().extract({
      path: "pkg/a.go",
      sha: "s",
      content: "// Serve starts the listener.\nfunc Serve() {}\n",
    });

    assert.deepEqual(cards.map((card) => card.question), ["What does `Serve()` do?"]);
  } finally {
    delete process.env[ENDPOINT_ENV.url];
    delete process.env[ENDPOINT_ENV.model];
  }
});
