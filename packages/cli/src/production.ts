import type { Server } from "node:http";
import { join } from "node:path";
import { generateCards } from "@flashlearn/extraction";
import { createFlashLearnServer } from "@flashlearn/frontend";
import { scheduleReview, selectNextCard } from "@flashlearn/learning";
import { initializeStore, JsonCardRepository, JsonReviewRepository } from "@flashlearn/storage";
import type { CliDependencies } from "./dependencies.js";
import { flashlearnRoot } from "./paths.js";

export function createProductionDependencies(): CliDependencies {
  return {
    initializeStore,
    generateCards,
    createCardRepository: (root) => new JsonCardRepository(join(flashlearnRoot(root), "cards.json")),
    createReviewRepository: (root) => new JsonReviewRepository(join(flashlearnRoot(root), "review.json")),
    scheduleReview,
    selectNextCard,
    createServer: createFlashLearnServer,
    listenServer: async (handle, host, port) => {
      const server = handle as Server;
      await new Promise<void>((resolveListen, reject) => {
        const onError = (error: Error) => reject(error);
        server.once("error", onError);
        server.listen(port, host, () => {
          server.off("error", onError);
          resolveListen();
        });
      });
    },
    now: () => new Date(),
  };
}
