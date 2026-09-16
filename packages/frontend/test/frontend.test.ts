import assert from "node:assert/strict";
import test from "node:test";
import { FrontendService, createFlashLearnServer, renderPage } from "../src/index.js";

const card = { id: "1", question: "Q", answer: "secret", source: { path: "a.ts", sha: "abc" }, createdAt: "now", updatedAt: "now" };

const services = {
  listCards: async () => [card],
  nextCard: async () => card,
  getCard: async () => card,
  submitReview: async () => ({ cardId: "1", easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1 }),
};

/** Runs `use` against a listening server and always closes it. */
async function serving(use: (origin: string) => Promise<void>): Promise<void> {
  const server = createFlashLearnServer(services);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  try {
    await use(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("next card response does not reveal the answer", async () => {
  await serving(async (origin) => {
    const response = await fetch(`${origin}/api/cards/next`);
    assert.deepEqual(await response.json(), { id: "1", question: "Q", source: { path: "a.ts", sha: "abc" } });
  });
});

test("an unknown api path stays JSON rather than falling through to the client", async () => {
  await serving(async (origin) => {
    const response = await fetch(`${origin}/api/nope`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found" });
  });
});

test("a browser route serves the client shell so the client owns routing", async () => {
  await serving(async (origin) => {
    const response = await fetch(`${origin}/some/deep/route`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
  });
});

test("an encoded traversal cannot read a file outside the built client", async () => {
  await serving(async (origin) => {
    // Each target is a real file at that depth from client/dist: two levels up is
    // the package manifest, four is the workspace root manifest. Asserting on
    // the wrong one would let the check pass with the guard removed.
    const cases: [string, RegExp][] = [
      ["/%2e%2e%2f%2e%2e%2fpackage.json", /"@flashlearn\/frontend"/],
      ["/assets/../../../../package.json", /"workspaces"/],
    ];
    for (const [path, leak] of cases) {
      const body = await (await fetch(`${origin}${path}`)).text();
      assert.doesNotMatch(body, leak, `${path} escaped the client directory`);
    }
  });
});

test("a malformed percent-escape is answered, not fatal", async () => {
  await serving(async (origin) => {
    // `decodeURIComponent` throws on these. The handler returned the promise
    // without awaiting it, so the rejection escaped the catch and killed the
    // process on a single request.
    // Bounded: without the fix the request never completes, and an unbounded
    // fetch would hang the suite instead of reporting the failure.
    for (const path of ["/%", "/%zz", "/assets/%E0%A4%A"]) {
      const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(2000) });
      assert.equal(response.status, 200, `${path} did not get a response`);
    }
  });
});

test("an /api path with no trailing slash stays JSON", async () => {
  await serving(async (origin) => {
    const response = await fetch(`${origin}/api`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found" });
  });
});

/** Every package exposes a `<Pkg>Service implements <Pkg>Workstream`; the CLI
 *  composes the free functions, so this is the only thing holding the class to
 *  the interface it declares. */
test("FrontendService is the workstream interface bound to the real implementation", async () => {
  const service = new FrontendService();

  const shell = service.renderPage();
  assert.match(shell, /<!doctype html>/i, "the shell is the built client, or its build instructions");

  const server = service.createServer(services);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/cards`);
    assert.deepEqual(await response.json(), [card], "it routes through the same handlers");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("a client route serves the same shell renderPage returns", async () => {
  await serving(async (origin) => {
    const response = await fetch(`${origin}/some/client/route`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), renderPage(), "the route and the shell disagreed");
  });
});

test("a missing asset is a 404, not the shell", async () => {
  await serving(async (origin) => {
    // Answering `/assets/index-abc.js` with HTML makes the browser refuse the
    // script on its MIME check and render a blank page with nothing to look at.
    const response = await fetch(`${origin}/assets/does-not-exist-abc123.js`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Not found" });
  });
});

test("HEAD answers as GET does, without a body", async () => {
  await serving(async (origin) => {
    for (const path of ["/", "/api/cards"]) {
      const response = await fetch(`${origin}${path}`, { method: "HEAD" });
      assert.equal(response.status, 200, `HEAD ${path}`);
      assert.equal(await response.text(), "", `HEAD ${path} returned a body`);
    }
  });
});

test("a malformed or misshapen review body is the client's fault, not a server fault", async () => {
  await serving(async (origin) => {
    const post = (body: string) => fetch(`${origin}/api/review`, {
      method: "POST", headers: { "content-type": "application/json" }, body,
    });
    for (const body of ["{oops", "", "null", "[]", '{"cardId":"1"}', '{"cardId":"1","result":"nope"}', '{"result":"easy"}']) {
      const response = await post(body);
      assert.equal(response.status, 400, `body ${JSON.stringify(body)} should be a bad request`);
      assert.deepEqual(await response.json(), { error: "Invalid review" });
    }
  });
});

test("a review for an unknown card is a 404, not a 500", async () => {
  const missing = { ...services, getCard: async () => null };
  const server = createFlashLearnServer(missing);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/review`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId: "nope", result: "easy" }),
    });
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Card not found" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
