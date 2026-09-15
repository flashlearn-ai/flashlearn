import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { CliService } from "../src/workstream.js";
import { GENERATED_CARD, RecordingDependencies } from "./fakes/harness.js";

async function projectWithCard() {
  const dependencies = new RecordingDependencies();
  const root = resolve("/repo");
  dependencies.directories.add(root);
  dependencies.generatedCards = [GENERATED_CARD];
  const service = new CliService(dependencies);
  const [card] = await service.generate(root);
  assert(card);
  return { dependencies, root, service, card };
}

test("saves a selected project and sets the process environment adapter", async () => {
  const dependencies = new RecordingDependencies();
  const root = resolve("/repo");
  dependencies.directories.add(root);
  const service = new CliService(dependencies);

  assert.equal(await service.setProject(root), root);
  assert.equal(dependencies.savedProject, root);
  assert.equal(dependencies.environmentProjectPath, root);
});

test("prefers an environment project over the saved project", async () => {
  const dependencies = new RecordingDependencies();
  dependencies.environmentProjectPath = resolve("/environment");
  dependencies.savedProject = resolve("/saved");
  dependencies.directories.add(dependencies.environmentProjectPath);
  const service = new CliService(dependencies);

  assert.equal(await service.resolveProject(), dependencies.environmentProjectPath);
});

test("reads cards from the selected project's repository", async () => {
  const { dependencies, root, service, card } = await projectWithCard();
  dependencies.savedProject = root;
  assert.deepEqual(await service.getCard(card.id), card);
  assert.deepEqual(await service.listCards(), [card]);
});

test("summarizes selected project review status", async () => {
  const { dependencies, root, service, card } = await projectWithCard();
  dependencies.savedProject = root;
  dependencies.createReviewRepository(root).states.set(card.id, {
    cardId: card.id,
    easeFactor: 2.5,
    intervalDays: 1,
    reviewCount: 1,
    correctCount: 1,
    nextReview: "2026-01-01T00:00:00.000Z",
  });

  assert.deepEqual(await service.status(), { project: root, cards: 1, reviewed: 1, unreviewed: 0, due: 1 });
});

test("requires a selected project for query commands", async () => {
  await assert.rejects(() => new CliService(new RecordingDependencies()).listCards(), /project set/);
});
