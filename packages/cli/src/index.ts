#!/usr/bin/env node
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { generateCards } from "@flashlearn/extraction";
import { createFlashLearnServer } from "@flashlearn/frontend";
import { scheduleReview, selectNextCard } from "@flashlearn/learning";
import { initializeStore, JsonCardRepository, JsonReviewRepository } from "@flashlearn/storage";
import type { Card, ReviewResult } from "../../../contracts/index.js";

const [command, argument] = process.argv.slice(2);
const root = process.cwd();

function repositories(directory: string) {
  return {
    cards: new JsonCardRepository(resolve(directory, ".flashlearn/cards.json")),
    reviews: new JsonReviewRepository(resolve(directory, ".flashlearn/review.json")),
  };
}

if (command === "init") {
  await initializeStore(root);
  console.log(`Initialized ${resolve(root, ".flashlearn")}`);
} else if (command === "generate") {
  const directory = resolve(argument ?? root);
  await initializeStore(directory);
  const { cards } = repositories(directory);
  const now = new Date().toISOString();
  for (const generated of await generateCards(directory)) {
    const id = createHash("sha256").update(`${generated.source.path}\0${generated.question}`).digest("hex").slice(0, 16);
    const existing = await cards.get(id);
    const card: Card = { ...generated, id, createdAt: existing?.createdAt ?? now, updatedAt: now };
    await cards.save(card);
  }
  console.log(`Stored ${(await cards.list()).length} cards`);
} else if (command === "start") {
  await initializeStore(root);
  const { cards, reviews } = repositories(root);
  const server = createFlashLearnServer({
    listCards: () => cards.list(),
    getCard: (id) => cards.get(id),
    nextCard: async () => {
      const allCards = await cards.list();
      return selectNextCard(allCards, await Promise.all(allCards.map(({ id }) => reviews.get(id))));
    },
    submitReview: async (cardId: string, result: ReviewResult) => {
      if (!await cards.get(cardId)) throw new Error("Card not found");
      const state = scheduleReview(await reviews.get(cardId), result);
      await reviews.save(state);
      return state;
    },
  });
  const port = Number(process.env.PORT ?? 4173);
  server.listen(port, "127.0.0.1", () => console.log(`FlashLearn running at http://127.0.0.1:${port}`));
} else {
  console.error("Usage: flashlearn <init|generate [directory]|start>");
  process.exitCode = 1;
}
