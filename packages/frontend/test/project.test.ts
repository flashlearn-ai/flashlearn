import assert from "node:assert/strict";
import test from "node:test";
import { createFlashLearnServer } from "../src/index.js";
import { projectName } from "../client/src/lib/project.js";

const card = { id: "1", question: "Q", answer: "secret", source: { path: "a.ts", sha: "abc" }, createdAt: "now", updatedAt: "now" };
const services = {
  listCards: async () => [card],
  nextCard: async () => card,
  getCard: async () => card,
  submitReview: async () => ({ cardId: "1", easeFactor: 2.5, intervalDays: 1, reviewCount: 1, correctCount: 1 }),
};

async function get(path: string, extra: Partial<typeof services> & { project?: () => Promise<{ name: string | null }> } = {}) {
  const server = createFlashLearnServer({ ...services, ...extra });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
    return { status: response.status, body: await response.json() as unknown };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("a composition that knows the project reports its name", async () => {
  const { status, body } = await get("/api/project", { project: async () => ({ name: "kubernetes" }) });
  assert.equal(status, 200);
  assert.deepEqual(body, { name: "kubernetes" });
});

/** A composition that cannot name the project answers exactly as a project that
 *  declares no name does. Both are "not known", and the client renders neither. */
test("a composition that cannot name the project reports null, not an error", async () => {
  const { status, body } = await get("/api/project");
  assert.equal(status, 200, "the project exists; only its name is unknown");
  assert.deepEqual(body, { name: null });
});

test("a project that declares no name is reported the same way", async () => {
  const { status, body } = await get("/api/project", { project: async () => ({ name: null }) });
  assert.equal(status, 200);
  assert.deepEqual(body, { name: null });
});

test("a name is read from the response only when it is a usable string", () => {
  assert.equal(projectName({ name: "flashlearn" }), "flashlearn");
  assert.equal(projectName({ name: "  kubernetes  " }), "kubernetes", "surrounding space is not part of a name");
  for (const payload of [{ name: null }, { name: "" }, { name: "   " }, { name: 42 }, {}, null, "nope", []]) {
    assert.equal(projectName(payload), null, `${JSON.stringify(payload)} should not produce a title`);
  }
});
