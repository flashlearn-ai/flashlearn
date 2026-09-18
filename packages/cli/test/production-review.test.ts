import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { FrontendServices } from "../src/dependencies.js";
import { createProductionDependencies } from "../src/production.js";
import { CliService } from "../src/workstream.js";
import { GENERATED_CARD } from "./fakes/harness.js";

test("concurrent production reviews persist every result and retain next-card semantics", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-reviews-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dependencies = createProductionDependencies();
  const frontends: FrontendServices[] = [];
  dependencies.createServer = (services) => { frontends.push(services); return null; };
  dependencies.listenServer = async () => {};
  dependencies.generateCards = async () => [GENERATED_CARD, { ...GENERATED_CARD, question: "Another question?" }];
  dependencies.now = () => new Date("2026-01-02T03:04:05.000Z");
  const service = new CliService(dependencies);
  const cards = await service.generate(root);
  await service.start(root);
  await new CliService(dependencies).start(root);
  assert.equal(cards.length, 2);
  const results = await Promise.all(cards.flatMap((card) => Array.from({ length: 10 }, (_, index) =>
    frontends[index % 2]!.submitReview(card.id, "correct"),
  )));
  for (const card of cards) {
    assert.deepEqual(results.filter(({ cardId }) => cardId === card.id).map(({ reviewCount }) => reviewCount), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const persisted = await dependencies.createReviewRepository(root).get(card.id);
    assert.equal(persisted.reviewCount, 10);
    assert.equal(persisted.correctCount, 10);
  }
  assert.equal(await frontends[0]!.nextCard(), null, "future-due cards are not selected");
  await frontends[0]!.submitReview(cards[0]!.id, "incorrect");
  assert.equal((await frontends[0]!.nextCard())?.id, cards[0]!.id, "incorrect makes the card immediately due under the existing engine");
});
