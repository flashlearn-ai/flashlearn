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

test("project resolution uses cwd or the supplied directory", async () => {
  const dependencies = new RecordingDependencies();
  dependencies.directories.add(resolve("."));
  dependencies.directories.add(resolve("other"));
  const service = new CliService(dependencies);
  assert.equal(await service.resolveProject(), resolve("."));
  assert.equal(await service.resolveProject("other"), resolve("other"));
  await assert.rejects(() => service.resolveProject("missing"), /Project directory not found/);
});

test("reads cards from the selected project's repository", async () => {
  const { dependencies, root, service, card } = await projectWithCard();
  dependencies.directories.add(resolve("."));
  assert.deepEqual(await service.getCard(card.id, root), card);
  assert.deepEqual(await service.listCards(root), [card]);
  assert.deepEqual(await service.listCards(), []);
});

test("summarizes selected project review status", async () => {
  const { dependencies, root, service, card } = await projectWithCard();
  dependencies.createReviewRepository(root).states.set(card.id, {
    cardId: card.id,
    easeFactor: 2.5,
    intervalDays: 1,
    reviewCount: 1,
    correctCount: 1,
    nextReview: "2026-01-01T00:00:00.000Z",
  });

  assert.deepEqual(await service.status(root), { project: root, cards: 1, reviewed: 1, unreviewed: 0, due: 1 });
});

test("requires an existing directory for query commands", async () => {
  await assert.rejects(() => new CliService(new RecordingDependencies()).listCards(), /Project directory not found/);
});
