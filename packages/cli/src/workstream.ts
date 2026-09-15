import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { Card, ReviewResult } from "../../../contracts/index.js";
import type { CliDependencies, FrontendServices } from "./dependencies.js";

export type StartOptions = {
  host?: string;
  port?: number;
};

export interface CliWorkstream {
  initialize(root: string): Promise<void>;
  generate(directory: string): Promise<Card[]>;
  start(root: string, options?: StartOptions): Promise<void>;
}

export class CliService implements CliWorkstream {
  constructor(private readonly dependencies: CliDependencies) {}

  async initialize(root: string): Promise<void> {
    await this.dependencies.initializeStore(resolve(root));
  }

  async generate(directory: string): Promise<Card[]> {
    const root = resolve(directory);
    await this.dependencies.initializeStore(root);
    const repository = this.dependencies.createCardRepository(root);
    const generatedCards = await this.dependencies.generateCards(root);
    const updatedAt = this.dependencies.now().toISOString();
    const cards: Card[] = [];

    for (const generated of generatedCards) {
      this.validateGeneratedCard(generated);
      const id = createHash("sha256")
        .update(`${generated.source.path}\0${generated.question}`)
        .digest("hex")
        .slice(0, 16);
      const existing = await repository.get(id);
      const card: Card = {
        ...generated,
        id,
        createdAt: existing?.createdAt ?? updatedAt,
        updatedAt,
      };
      await repository.save(card);
      cards.push(card);
    }

    return cards;
  }

  async start(root: string, options: StartOptions = {}): Promise<void> {
    const projectRoot = resolve(root);
    await this.dependencies.initializeStore(projectRoot);
    const cards = this.dependencies.createCardRepository(projectRoot);
    const reviews = this.dependencies.createReviewRepository(projectRoot);
    const services: FrontendServices = {
      listCards: () => cards.list(),
      getCard: (id) => cards.get(id),
      nextCard: async () => {
        const allCards = await cards.list();
        const states = await Promise.all(allCards.map(({ id }) => reviews.get(id)));
        return this.dependencies.selectNextCard(allCards, states, this.dependencies.now());
      },
      submitReview: async (cardId: string, result: ReviewResult) => {
        if (!await cards.get(cardId)) throw new Error(`Card not found: ${cardId}`);
        const state = this.dependencies.scheduleReview(
          await reviews.get(cardId),
          result,
          this.dependencies.now(),
        );
        await reviews.save(state);
        return state;
      },
    };
    const server = this.dependencies.createServer(services);
    await this.dependencies.listenServer(server, options.host ?? "localhost", options.port ?? 4173);
  }

  private validateGeneratedCard(card: {
    question?: unknown;
    answer?: unknown;
    source?: { path?: unknown; sha?: unknown };
  }): void {
    if (
      typeof card.question !== "string"
      || typeof card.answer !== "string"
      || typeof card.source?.path !== "string"
      || typeof card.source.sha !== "string"
    ) {
      throw new Error("Extraction returned an invalid GeneratedCard");
    }
  }
}
