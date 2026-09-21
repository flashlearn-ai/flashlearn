import type { Server } from "node:http";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import {
  CompositeExtractor,
  EndpointExtractor,
  ExtractionService,
  MarkdownExtractor,
  deterministicExtractor,
  generateCards,
} from "@flashlearn/extraction";
import { createFlashLearnServer } from "@flashlearn/frontend";
import { scheduleReview, selectNextCard } from "@flashlearn/learning";
import { initializeStore, JsonCardRepository, JsonReviewRepository } from "@flashlearn/storage";
import type { CliDependencies, GenerationProvider } from "./dependencies.js";
import { flashlearnRoot } from "./paths.js";
import { readProjectName } from "./project-name.js";
import { AnthropicExtractor, CopilotExtractor } from "./providers.js";

export function createProductionDependencies(): CliDependencies {
  return {
    initializeStore,
    generateCards: (root, options) => {
      if (!options?.provider) return generateCards(root, undefined, options);
      const { provider, ...scope } = options;
      const extractor = extractorFor(provider);
      const concurrency = provider.kind === "copilot" ? 1 : 8;
      return new ExtractionService(extractor, concurrency).generateFromRepository(root, scope);
    },
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

function extractorFor(provider: GenerationProvider) {
  if (provider.kind === "deterministic") return deterministicExtractor();
  const code = provider.kind === "copilot"
    ? new CopilotExtractor()
    : provider.kind === "anthropic"
      ? new AnthropicExtractor(provider.apiKey, provider.model)
      : new EndpointExtractor(provider);
  return new CompositeExtractor(code, new MarkdownExtractor());
}
