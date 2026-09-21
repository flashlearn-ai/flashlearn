import assert from "node:assert/strict";
import test from "node:test";
import { classifySources, relevantSource, selectBatches, sourceExcerpt } from "../src/source-selection.js";
import { qualityReason, selectCards, type Candidate } from "../src/card-quality.js";
import { copilotBatch, inferenceRunner } from "../src/providers.js";
import { generateBounded } from "../src/generation.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const doc = (path: string, content = "Source describes lifecycle and component responsibilities.") => ({ path, content, sha: "trusted" });

test("classification excludes license copies, agent tooling and test helpers before budgets", () => {
  for (const path of ["_LICENSES/gomq/client.go", ".agents/skills/x/SKILL.md", "vendor/x.go", "src/testdata/x.ts", "internal/e2e/resume.go", "store/storetest/a.go", "src/a.test.ts", "AGENTS.md", "CONTRIBUTING.md"]) {
    assert.equal(relevantSource(doc(path)), false, path);
  }
  for (const path of ["README.md", "docs/architecture.md", "cmd/server/main.go", "src/latest.ts"]) assert(relevantSource(doc(path)), path);
  const result = classifySources([doc(".agents/a.md"), doc("a.md"), doc("docs/architecture.md"), doc("README.md", "# App\n[Glossary](docs/glossary.md)"), doc("docs/glossary.md")]);
  assert.equal(result.excluded, 1);
  assert.equal(result.ranked[0]?.path, "README.md");
  assert(result.ranked.indexOf(result.ranked.find((d) => d.path === "docs/glossary.md")!) < result.ranked.indexOf(result.ranked.find((d) => d.path === "a.md")!));
});

test("bounded planning reserves documentation and groups related components", () => {
  const documents = [doc("README.md"), ...Array.from({ length: 12 }, (_, i) => doc(`docs/design-${i}.md`)),
    ...Array.from({ length: 40 }, (_, i) => doc(`cmd/server/flow-${i}.go`)), doc("cmd/router/main.go"), doc("cmd/worker/main.go")];
  const batches = selectBatches(classifySources(documents).ranked);
  assert(batches.length <= 8);
  assert(batches.every((batch) => batch.length <= 4));
  assert(batches[0]!.some((file) => file.path === "README.md"));
  assert.equal(batches[0]!.length, 1);
  assert.equal(batches.slice(0, 2).flat().length, 5);
  for (const batch of batches.slice(2)) assert.equal(new Set(batch.map((file) => file.path.split("/")[1])).size, 1);
  assert(batches.flat().some((file) => file.path === "cmd/router/main.go"));
});

test("excerpts retain aspiration warnings, whole sections and relevant declarations", () => {
  const text = "# Architecture\nNOTE: This is aspirational.\n\n## Install\n" + "noise ".repeat(2000) + "\n## Lifecycle\nA request restores saved state before routing.\n";
  const excerpt = sourceExcerpt(doc("docs/architecture.md", text), 1000);
  assert(excerpt.includes("aspirational"));
  assert(excerpt.includes("A request restores saved state before routing."));
  assert(excerpt.length <= 1000);
  const code = "package server\n" + Array.from({ length: 20 }, (_, i) => `func Helper${i}() {\n${"// filler\n".repeat(100)}}\n`).join("") + "func Resume() {\n restore()\n}\n";
  assert(sourceExcerpt(doc("server.go", code), 2000).includes("func Resume() {\n restore()\n}"));
  assert(sourceExcerpt(doc("minified.js", "x".repeat(20000)), 1000).length <= 1000);
});

const card = (question: string, answer: string, path = "src/cache.ts"): Candidate => ({ question, answer, source: { path, sha: "sha" } });
test("quality rejects incomplete lists, contextless helpers, trivia and copied-heading prompts", () => {
  for (const candidate of [
    card('What does "Introduction" cover?', "The module provides data access for all consumers."),
    card("How does Load recover?", "Loading falls back to a cached configuration snapshot."),
    card("What are the five steps of CA rotation?", "Steady state; publish; age in; switch; age out; cleanup"),
    card("How does routing work?", "Routing obeys the following rules:"),
    card("How does routing work?", "The rules are ..."),
    card("What default port does the router use?", "The router uses port 8443 for all incoming traffic."),
  ]) assert(qualityReason(candidate), candidate.question);
  assert.equal(qualityReason(card("Why does cache eviction rename directories before deleting them?", "Renaming removes the lookup path immediately, allowing slow deletion afterward without blocking readers.")), null);
});

test("ranking keeps foundation first, deduplicates paraphrases and limits source dominance", () => {
  const foundation = { ...card("Why separate actors from workers?", "Idle actors release compute capacity while keeping persistent identity and saved state.", "README.md"), goal: "architecture" as const };
  const duplicate = card("Why are actors separated from workers?", foundation.answer, "docs/concepts.md");
  const candidates = Array.from({ length: 20 }, (_, i) => card(`What does handler ${i} do?`, `Unique${i} behavior ${i} is described by action${i}, result${i}, invariant${i}.`));
  const result = selectCards([...candidates, foundation, duplicate]);
  assert.equal(result.cards[0]?.source.path, "README.md");
  assert.equal(result.cards.filter((c) => c.answer === foundation.answer).length, 1);
  assert(result.cards.filter((c) => c.source.path === "src/cache.ts").length <= 8);
});

test("AI evidence must occur in the cited excerpt, not another file or README context", async () => {
  const docs = [doc("a.go", "A source evidence sentence about scheduler ownership."), doc("b.go", "A different source evidence sentence about request routing.")];
  const output = await copilotBatch(docs, "auto", 100, async () => JSON.stringify({ cards: [
    { fileId: 0, question: "Why does scheduling separate selection?", answer: "The scheduler owns placement decisions and capacity checks.", evidence: docs[0]!.content, concept: "placement ownership", goal: "architecture" },
    { fileId: 0, question: "What does routing do?", answer: "The router owns dispatch to a worker.", evidence: docs[1]!.content, concept: "routing", goal: "flow" },
  ] }));
  assert.equal(output.length, 1);
});

test("documentation questions retain attribution and aspirational status qualification", async () => {
  const source = doc("docs/architecture.md", "# Architecture\nNOTE: This architecture is aspirational, not yet implemented!\nWorkers restore a snapshot before forwarding traffic.");
  const [card] = await copilotBatch([source], "auto", 100, async () => JSON.stringify({ cards: [{
    fileId: 0, question: "How do workers receive traffic?", answer: "Workers restore snapshots before forwarding traffic.",
    evidence: "Workers restore a snapshot before forwarding traffic.", goal: "flow", concept: "restore before route",
  }] }));
  assert.match(card!.question, /^According to docs\/architecture.md,/);
  assert.match(card!.answer, /^Documented design/);
});

test("README is selected under a small file budget and AI failures do not add filler", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-selection-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".agents"));
  await writeFile(join(root, ".agents/a.md"), "# Agent rules\nAlways follow this irrelevant process advice when editing repositories.\n");
  await writeFile(join(root, "README.md"), "# Request routing\nThe router restores suspended workers before forwarding incoming requests.\n");
  let called = false;
  const result = await generateBounded(root, { maxFiles: 1, provider: { kind: "copilot" } }, async (prompt) => {
    called = true;
    assert(prompt.includes("File 0: README.md"));
    assert(!prompt.includes("irrelevant process advice"));
    return null;
  });
  assert(called);
  assert.deepEqual(result, []);
});

test("HTTP providers use the same prompt path for Markdown and preserve API authentication", async () => {
  for (const provider of [
    { kind: "endpoint" as const, url: "https://example.test/chat", model: "test", apiKey: "key" },
    { kind: "anthropic" as const, model: "test", apiKey: "key" },
  ]) {
    const runner = inferenceRunner(provider, async (_url, init) => {
      const body = JSON.parse(String(init.body));
      assert(body.messages[0].content.includes("README.md"));
      assert.equal((init.headers as Record<string, string>)[provider.kind === "endpoint" ? "authorization" : "x-api-key"], provider.kind === "endpoint" ? "Bearer key" : "key");
      return Response.json(provider.kind === "endpoint" ? { choices: [{ message: { content: '{"cards":[]}' } }] } : { content: [{ type: "text", text: '{"cards":[]}' }] });
    });
    assert.deepEqual(await copilotBatch([doc("README.md")], "auto", 100, runner), []);
  }
});
