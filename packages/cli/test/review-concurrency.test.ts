import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { CliService } from "../src/workstream.js";
import { GENERATED_CARD, RecordingDependencies } from "./fakes/harness.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("concurrent reviews serialize reads through persisted writes, across server compositions", async () => {
  const dependencies = new RecordingDependencies();
  dependencies.generatedCards = [GENERATED_CARD];
  const service = new CliService(dependencies);
  const [card] = await service.generate("/repo");
  assert(card);
  await service.start("/repo");
  const firstServer = dependencies.frontendServices!;
  await new CliService(dependencies).start("/repo/./");
  const secondServer = dependencies.frontendServices!;
  const reviews = dependencies.createReviewRepository(resolve("/repo"));
  const save = reviews.save.bind(reviews);
  const entered = deferred();
  const release = deferred();
  reviews.save = async (state) => {
    if (state.reviewCount === 1) { entered.resolve(); await release.promise; }
    await save(state);
  };
  const first = firstServer.submitReview(card.id, "easy");
  await entered.promise;
  const second = secondServer.submitReview(card.id, "incorrect");
  await new Promise<void>((done) => setImmediate(done));
  assert.equal(dependencies.scheduledReviews.length, 1, "second review must not read/schedule before first save completes");
  dependencies.currentTime = new Date("2026-02-01T00:00:00Z");
  release.resolve();
  const states = await Promise.all([first, second]);
  assert.deepEqual(states.map(({ reviewCount }) => reviewCount), [1, 2]);
  assert.equal(states[1]?.correctCount, 1);
  assert.deepEqual(await reviews.get(card.id), states[1]);
  assert.equal(dependencies.scheduledReviews[1]?.now?.toISOString(), dependencies.currentTime.toISOString());
});

for (const stage of ["read", "schedule", "save"] as const) {
  test(`a rejected ${stage} does not poison queued or later reviews`, async () => {
    const dependencies = new RecordingDependencies();
    dependencies.generatedCards = [GENERATED_CARD];
    const service = new CliService(dependencies);
    const [card] = await service.generate("/repo");
    assert(card);
    await service.start("/repo");
    const frontend = dependencies.frontendServices!;
    const reviews = dependencies.createReviewRepository(resolve("/repo"));
    let fail = true;
    const maybeFail = () => {
      if (fail) { fail = false; throw new Error(`${stage} failed`); }
    };
    if (stage === "read") {
      const get = reviews.get.bind(reviews);
      reviews.get = async (id) => { maybeFail(); return get(id); };
    } else if (stage === "schedule") {
      const schedule = dependencies.scheduleReview.bind(dependencies);
      dependencies.scheduleReview = (...args) => { maybeFail(); return schedule(...args); };
    } else {
      const save = reviews.save.bind(reviews);
      reviews.save = async (state) => { maybeFail(); await save(state); };
    }
    const failed = frontend.submitReview(card.id, "easy");
    const queued = frontend.submitReview(card.id, "hard");
    await assert.rejects(failed, new RegExp(`${stage} failed`));
    assert.equal((await queued).reviewCount, 1);
    assert.equal((await frontend.submitReview(card.id, "correct")).reviewCount, 2);
    assert.equal((await reviews.get(card.id)).reviewCount, 2);
  });
}

test("independent cards and projects do not wait for a blocked review", { timeout: 5000 }, async () => {
  const dependencies = new RecordingDependencies();
  dependencies.generatedCards = [GENERATED_CARD, { ...GENERATED_CARD, question: "Another question?" }];
  const service = new CliService(dependencies);
  const [first, other] = await service.generate("/repo");
  assert(first && other);
  await service.generate("/another");
  await service.start("/repo");
  const frontend = dependencies.frontendServices!;
  await service.start("/another");
  const another = dependencies.frontendServices!;
  const reviews = dependencies.createReviewRepository(resolve("/repo"));
  const get = reviews.get.bind(reviews);
  const entered = deferred();
  const release = deferred();
  reviews.get = async (id) => {
    if (id === first.id) { entered.resolve(); await release.promise; }
    return get(id);
  };
  const blocked = frontend.submitReview(first.id, "easy");
  await entered.promise;
  try {
    assert.equal((await frontend.submitReview(other.id, "correct")).reviewCount, 1);
    assert.equal((await another.submitReview(first.id, "hard")).reviewCount, 1);
  } finally {
    release.resolve();
    await blocked;
  }
});
