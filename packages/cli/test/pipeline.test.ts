import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { CliService } from "../src/workstream.js";
import { GENERATED_CARD, RecordingDependencies } from "./fakes/harness.js";

test("runs generated knowledge through storage, learning, and frontend services", async () => {
  const dependencies = new RecordingDependencies();
  dependencies.generatedCards = [GENERATED_CARD];
  const service = new CliService(dependencies);

  const [generated] = await service.generate("/repo");
  assert(generated);
  await service.start("/repo");
  const frontend = dependencies.frontendServices;
  assert(frontend);

  assert.deepEqual(await frontend.listCards(), [generated]);
  assert.deepEqual(await frontend.getCard(generated.id), generated);
  assert.deepEqual(await frontend.nextCard(), generated);

  const reviewed = await frontend.submitReview(generated.id, "correct");
  assert.equal(reviewed.cardId, generated.id);
  assert.equal(reviewed.reviewCount, 1);
  assert.equal(dependencies.createReviewRepository(resolve("/repo")).saved.at(-1), reviewed);
});

test("preserves createdAt when generation updates an existing card", async () => {
  const dependencies = new RecordingDependencies();
  dependencies.generatedCards = [GENERATED_CARD];
  const service = new CliService(dependencies);
  const [first] = await service.generate("/repo");
  assert(first);

  dependencies.currentTime = new Date("2026-02-03T04:05:06.000Z");
  const [updated] = await service.generate("/repo");
  assert(updated);
  assert.equal(updated.createdAt, first.createdAt);
  assert.notEqual(updated.updatedAt, first.updatedAt);
});
