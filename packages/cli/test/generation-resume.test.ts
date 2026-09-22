import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test, { type TestContext } from "node:test";
import { generateBounded } from "../src/generation.js";
import { checkpointPath } from "../src/generation-checkpoint.js";
import { createProductionDependencies } from "../src/production.js";
import { CliService } from "../src/workstream.js";
import { copilotError, inferenceRunner } from "../src/providers.js";
import { generationProgress } from "../src/progress.js";
import type { GenerateOptions } from "../src/dependencies.js";

const options: GenerateOptions = { provider: { kind: "copilot", model: "auto" } };
const evidence = "The scheduler reserves capacity before activating workloads.";
const batch = JSON.stringify({ cards: [
  ["Why does scheduling reserve worker capacity?", "Reservations prevent competing activations from consuming the same worker slot."],
  ["How does snapshot storage retain actor data?", "Durable object storage holds the serialized filesystem and process state across restarts."],
  ["What happens if authentication rejects an actor?", "The gateway refuses the request before it reaches a workload, protecting tenant isolation."],
  ["How are events delivered to running workloads?", "An ingress router resolves the current placement and forwards incoming traffic to that address."],
  ["Why does cache eviction retire directories first?", "A rename disconnects the lookup path before background cleanup removes large directory trees."],
].map(([question, answer], index) => ({ fileId: 0, question, answer, evidence, goal: "rationale", concept: `concept-${index}` })) });
const category = JSON.stringify({ categories: [{ name: "Runtime Design And Behavior", cardIds: [0, 1, 2, 3, 4] }] });

async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-resume-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, "README.md"), `# System\n${evidence}\n`);
  return root;
}

test("category timeout retains generated cards; new service invocation retries only categories", async (t) => {
  const root = await fixture(t);
  let generated = 0, categorized = 0;
  const events: string[] = [];
  const configured = { ...options, onProgress: (event: { message?: string }) => { if (event.message) events.push(event.message); } };
  const first = createProductionDependencies();
  first.generateCards = (path, opts) => generateBounded(path, opts, async (prompt, _model, timeout) => {
    assert.equal(timeout, 900_000);
    if (prompt.startsWith("Organize")) { categorized++; throw new Error("Copilot timed out after 900s"); }
    generated++;
    return batch;
  });
  await assert.rejects(new CliService(first).generate(root, configured), /5 selected cards retained.*retry categorization/);
  assert.equal(JSON.parse(await readFile(join(root, ".flashlearn/cards.json"), "utf8")).length, 0);
  const saved = JSON.parse(await readFile(checkpointPath(root, options), "utf8"));
  assert.equal(saved.batches[0].length, 5);
  const second = createProductionDependencies();
  second.generateCards = (path, opts) => generateBounded(path, opts, async (prompt) => {
    assert(prompt.startsWith("Organize"), "completed source inference must never repeat");
    categorized++;
    return category;
  });
  const result = await new CliService(second).generate(root, configured);
  assert.equal(generated, 1);
  assert.equal(categorized, 2);
  assert.equal(result.length, 5);
  assert(events.some((message) => message.includes("Resuming checkpoint")));
  await assert.rejects(access(checkpointPath(root, options)), { code: "ENOENT" });
});

test("a failed batch does not discard successful siblings and only unfinished work retries", async (t) => {
  const root = await fixture(t);
  await writeFile(join(root, "server.go"), evidence);
  let fail = true;
  let readmeCalls = 0, codeCalls = 0;
  const runner = async (prompt: string) => {
    if (prompt.startsWith("Organize")) return category;
    if (prompt.includes("File 0: server.go")) {
      codeCalls++;
      if (fail) throw new Error("provider unavailable");
      return '{"cards":[]}';
    }
    readmeCalls++;
    return batch;
  };
  await assert.rejects(generateBounded(root, options, runner), /completed batches.*retained/);
  const state = JSON.parse(await readFile(checkpointPath(root, options), "utf8"));
  assert.equal(state.batches.filter((entry: unknown) => entry === null).length, 1);
  fail = false;
  assert.equal((await generateBounded(root, options, runner)).length, 5);
  assert.equal(readmeCalls, 1);
  assert.equal(codeCalls, 2);
});

test("categorized checkpoint survives a card-save failure without repeating either AI pass", async (t) => {
  const root = await fixture(t);
  const deps = createProductionDependencies();
  deps.generateCards = (path, opts) => generateBounded(path, opts, async (prompt) => prompt.startsWith("Organize") ? category : batch);
  const create = deps.createCardRepository;
  deps.createCardRepository = (path) => {
    const repository = create(path);
    repository.save = async () => { throw new Error("disk failure"); };
    return repository;
  };
  await assert.rejects(new CliService(deps).generate(root, options), /disk failure/);
  deps.createCardRepository = create;
  deps.generateCards = (path, opts) => generateBounded(path, opts, async () => { assert.fail("AI must not repeat after persistence failure"); });
  assert.equal((await new CliService(deps).generate(root, options)).length, 5);
  await assert.rejects(access(checkpointPath(root, options)), { code: "ENOENT" });
});

test("working-tree changes and --fresh invalidate completed inference; credentials are not persisted", async (t) => {
  const root = await fixture(t);
  let calls = 0;
  const runner = async () => { calls++; return '{"cards":[]}'; };
  await generateBounded(root, options, runner);
  await generateBounded(root, options, runner);
  assert.equal(calls, 1);
  await writeFile(join(root, "README.md"), `# Changed\n${evidence}`);
  await generateBounded(root, options, runner);
  assert.equal(calls, 2);
  await generateBounded(root, { ...options, fresh: true }, runner);
  assert.equal(calls, 3);
  const endpoint: GenerateOptions = { provider: { kind: "endpoint", url: "https://example.test", model: "m", apiKey: "private-key-value" } };
  await generateBounded(root, endpoint, runner);
  assert(!(await readFile(checkpointPath(root, endpoint), "utf8")).includes("private-key-value"));
});

test("provider errors retain useful cause and progress terminates its TTY line on pause", async () => {
  assert.match(copilotError({ killed: true, message: "secret prompt" }, 300_000).message, /timed out after 300s/);
  assert.match(copilotError({ code: 1, stderr: 'Model "missing" is unavailable', message: "secret prompt" }, 1).message, /Model "missing"/);
  assert(!copilotError({ code: 1, message: "secret prompt" }, 1).message.includes("secret prompt"));
  const runner = inferenceRunner({ kind: "endpoint", url: "https://example.test", model: "m" }, async () => new Response(null, { status: 401 }));
  await assert.rejects(runner("prompt"), /HTTP 401.*credentials/);
  const output: string[] = [];
  const progress = generationProgress((text) => output.push(text), true);
  progress({ phase: "categorizing", completed: 0, total: 5, cards: 5 });
  progress({ phase: "paused", completed: 0, total: 5, cards: 5 });
  assert(output.at(-1)!.endsWith("\n"));
});
