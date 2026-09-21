import type { Server } from "node:http";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { createFlashLearnServer } from "@flashlearn/frontend";
import { scheduleReview, selectNextCard } from "@flashlearn/learning";
import { initializeStore, JsonCardRepository, JsonReviewRepository } from "@flashlearn/storage";
import type { CliDependencies } from "./dependencies.js";
import { flashlearnRoot } from "./paths.js";
import { readProjectName } from "./project-name.js";
import { generateBounded } from "./generation.js";

export function createProductionDependencies(): CliDependencies {
  return {
    initializeStore,
    generateCards: generateBounded,
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
    readProjectName,
    isDirectory: async (path) => {
      try {
        return (await stat(path)).isDirectory();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
      }
    },
    now: () => new Date(),
  };
}
