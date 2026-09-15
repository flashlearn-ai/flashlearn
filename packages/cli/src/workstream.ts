import { createHash } from "node:crypto";
import type { Card, ReviewResult } from "../../../contracts/index.js";
import type { CliDependencies, FrontendServices } from "./dependencies.js";
import { projectRoot } from "./paths.js";

export type StartOptions = {
  host?: string;
  port?: number;
};

export type ProjectStatus = {
  project: string;
  cards: number;
  reviewed: number;
  unreviewed: number;
  due: number;
};

export interface CliWorkstream {
  initialize(root: string): Promise<void>;
  generate(directory: string): Promise<Card[]>;
  start(root: string, options?: StartOptions): Promise<void>;
  setProject(directory: string): Promise<string>;
  resolveProject(directory?: string): Promise<string>;
  getCard(id: string, directory?: string): Promise<Card | null>;
  listCards(directory?: string): Promise<Card[]>;
  status(directory?: string): Promise<ProjectStatus>;
}

export class CliService implements CliWorkstream {
  constructor(private readonly dependencies: CliDependencies) {}

  async initialize(root: string): Promise<void> {
    const rootPath = projectRoot(root);
    await this.dependencies.initializeStore(rootPath);
    await this.setProject(rootPath);
  }

  async generate(directory: string): Promise<Card[]> {
    const root = projectRoot(directory);
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
    const rootPath = projectRoot(root);
    await this.dependencies.initializeStore(rootPath);
    const cards = this.dependencies.createCardRepository(rootPath);
    const reviews = this.dependencies.createReviewRepository(rootPath);
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

  async setProject(directory: string): Promise<string> {
    const root = projectRoot(directory);
    if (!await this.dependencies.isDirectory(root)) throw new Error(`Directory not found: ${root}`);
    await this.dependencies.saveProject(root);
    this.dependencies.setEnvironmentProject(root);
    return root;
  }

  async resolveProject(directory?: string): Promise<string> {
    const selected = directory
      ?? this.dependencies.environmentProject()
      ?? await this.dependencies.loadSavedProject();
    if (!selected) throw new Error("No project selected. Run `flashlearn project set <directory>`.");
    const root = projectRoot(selected);
    if (!await this.dependencies.isDirectory(root)) throw new Error(`Project directory not found: ${root}`);
    return root;
  }

  async getCard(id: string, directory?: string): Promise<Card | null> {
    const root = await this.resolveProject(directory);
    return this.dependencies.createCardRepository(root).get(id);
  }

  async listCards(directory?: string): Promise<Card[]> {
    const root = await this.resolveProject(directory);
    return this.dependencies.createCardRepository(root).list();
  }

  async status(directory?: string): Promise<ProjectStatus> {
    const root = await this.resolveProject(directory);
    const cards = await this.dependencies.createCardRepository(root).list();
    const reviews = this.dependencies.createReviewRepository(root);
    const states = await Promise.all(cards.map(({ id }) => reviews.get(id)));
    const now = this.dependencies.now();
    const reviewed = states.filter(({ reviewCount }) => reviewCount > 0).length;
    const due = states.filter(({ nextReview }) => !nextReview || new Date(nextReview) <= now).length;
    return { project: root, cards: cards.length, reviewed, unreviewed: cards.length - reviewed, due };
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
