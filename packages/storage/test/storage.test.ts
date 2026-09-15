import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { StorageService } from "../src/index.js";

const card = {
  id: "1",
  question: "Q",
  answer: "A",
  source: { path: "a.ts", sha: "abc" },
  createdAt: "now",
  updatedAt: "now",
};

test("initializes the project store without replacing existing data", async () => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-storage-"));
  const storage = new StorageService();
  await storage.initialize(root);
  await writeFile(join(root, ".flashlearn", "cards.json"), "[\"existing\"]\n");

  await storage.initialize(root);

  assert.equal(await readFile(join(root, ".flashlearn", "cards.json"), "utf8"), "[\"existing\"]\n");
  assert.deepEqual(JSON.parse(await readFile(join(root, ".flashlearn", "review.json"), "utf8")), {});
  assert.deepEqual(JSON.parse(await readFile(join(root, ".flashlearn", "settings.json"), "utf8")), { version: 1 });
});

test("creates a project-scoped card repository with complete CRUD", async () => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-storage-"));
  const storage = new StorageService();
  await storage.initialize(root);
  const cards = storage.createCardRepository(root);

  await cards.save(card);
  assert.deepEqual(await cards.get(card.id), card);
  assert.deepEqual(await cards.list(), [card]);

  await cards.save({ ...card, answer: "Updated" });
  assert.equal((await cards.get(card.id))?.answer, "Updated");

  await cards.delete(card.id);
  assert.equal(await cards.get(card.id), null);
});

test("creates a project-scoped review repository with valid defaults", async () => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-storage-"));
  const storage = new StorageService();
  await storage.initialize(root);
  const reviews = storage.createReviewRepository(root);

  assert.deepEqual(await reviews.get(card.id), {
    cardId: card.id,
    easeFactor: 2.5,
    intervalDays: 0,
    reviewCount: 0,
    correctCount: 0,
  });

  const state = { ...await reviews.get(card.id), intervalDays: 4, reviewCount: 1, correctCount: 1 };
  await reviews.save(state);
  assert.deepEqual(await reviews.get(card.id), state);
});
