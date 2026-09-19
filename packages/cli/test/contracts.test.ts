import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { CliService } from "../src/workstream.js";
import { GENERATED_CARD, RecordingDependencies } from "./fakes/harness.js";

test("extraction boundary accepts attributed GeneratedCard output", async () => {
  const dependencies = new RecordingDependencies();
  dependencies.generatedCards = [GENERATED_CARD];
  const cards = await new CliService(dependencies).generate("/repo");

  assert.deepEqual(dependencies.generatedRoots, [resolve("/repo")]);
  assert.equal(cards[0]?.question, GENERATED_CARD.question);
  assert.deepEqual(cards[0]?.source, GENERATED_CARD.source);
  assert.match(cards[0]?.id ?? "", /^[a-f0-9]{16}$/);
});

test("storage boundary initializes and uses locked repositories", async () => {
  const dependencies = new RecordingDependencies();
  dependencies.generatedCards = [GENERATED_CARD];
  const service = new CliService(dependencies);
  await service.generate("/repo");

  const root = resolve("/repo");
  assert.deepEqual(dependencies.initializedRoots, [root]);
  assert.equal(dependencies.createCardRepository(root).saved.length, 1);
});

test("initialization creates project storage", async () => {
  const dependencies = new RecordingDependencies();
  const root = resolve("/repo");
  dependencies.directories.add(root);

  await new CliService(dependencies).initialize(root);

  assert.deepEqual(dependencies.initializedRoots, [root]);
});

test("extraction options cross the seam without changing the project root", async () => {
  const dependencies = new RecordingDependencies();
  dependencies.generatedCards = [GENERATED_CARD];
  const options = { subpath: "src", maxFiles: 2 };
  const cards = await new CliService(dependencies).generate("/repo", options);
  assert.deepEqual(dependencies.generatedRoots, [resolve("/repo")]);
  assert.deepEqual(dependencies.generationOptions, [options]);
  assert.deepEqual(cards[0]?.source, GENERATED_CARD.source);
});

test("learning boundary receives cards and review states and saves its result", async () => {
  const dependencies = new RecordingDependencies();
  dependencies.generatedCards = [GENERATED_CARD];
  const service = new CliService(dependencies);
  const [card] = await service.generate("/repo");
  assert(card);
  await service.start("/repo");

  assert.equal((await dependencies.frontendServices?.nextCard())?.id, card.id);
  assert.equal(dependencies.selectedCards?.states[0]?.cardId, card.id);
  const state = await dependencies.frontendServices?.submitReview(card.id, "easy");
  assert.equal(state?.reviewCount, 1);
  assert.equal(dependencies.createReviewRepository(resolve("/repo")).saved[0]?.cardId, card.id);
});

/** The composed service reports what the project declares, for the root the
 *  command was given. Asserted because removing the dependency entirely left
 *  every other test passing: nothing else exercises this path. */
test("frontend boundary reports the project name for the started root", async () => {
  const dependencies = new RecordingDependencies();
  dependencies.projectName = "kubernetes";
  await new CliService(dependencies).start("/repo");

  assert.deepEqual(await dependencies.frontendServices?.project(), { name: "kubernetes" });
  assert.deepEqual(dependencies.projectNameReads, ["/repo"]);
});

test("a project declaring no name reports none rather than a placeholder", async () => {
  const dependencies = new RecordingDependencies();
  dependencies.projectName = null;
  await new CliService(dependencies).start("/repo");

  assert.deepEqual(await dependencies.frontendServices?.project(), { name: null });
});

test("frontend boundary receives all services and server options", async () => {
  const dependencies = new RecordingDependencies();
  const service = new CliService(dependencies);
  await service.start("/repo", { host: "localhost", port: 8080 });

  assert(dependencies.frontendServices);
  assert.equal(typeof dependencies.frontendServices.listCards, "function");
  assert.equal(typeof dependencies.frontendServices.nextCard, "function");
  assert.equal(typeof dependencies.frontendServices.getCard, "function");
  assert.equal(typeof dependencies.frontendServices.submitReview, "function");
  assert.equal(typeof dependencies.frontendServices.project, "function");
  assert.deepEqual(dependencies.listenCalls, [{ server: dependencies.server, host: "localhost", port: 8080 }]);
});
