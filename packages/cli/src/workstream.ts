import { createHash } from "node:crypto";
import type { Card, ReviewResult } from "../../../contracts/index.js";
import type { CliDependencies, FrontendServices, GenerateOptions } from "./dependencies.js";
import { MAX_GENERATED_CARDS } from "./dependencies.js";
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
  generate(directory: string, options?: GenerateOptions): Promise<Card[]>;
  start(root: string, options?: StartOptions): Promise<void>;
  study(directory?: string): Promise<FrontendServices>;
  resolveProject(directory?: string): Promise<string>;
  getCard(id: string, directory?: string): Promise<Card | null>;
  listCards(directory?: string): Promise<Card[]>;
  status(directory?: string): Promise<ProjectStatus>;
}

// Shared by server/service instances in this process, keyed by project and card.
const pendingReviews = new Map<string, Promise<void>>();

export class CliService implements CliWorkstream {
  constructor(private readonly dependencies: CliDependencies) {}

  async initialize(root: string): Promise<void> {
    const rootPath = projectRoot(root);
    await this.dependencies.initializeStore(rootPath);
  }

  async generate(directory: string, options?: GenerateOptions): Promise<Card[]> {
    const root = projectRoot(directory);
    await this.dependencies.initializeStore(root);
    const repository = this.dependencies.createCardRepository(root);
    const generatedCards = (await this.dependencies.generateCards(root, options)).slice(0, MAX_GENERATED_CARDS);
    const updatedAt = this.dependencies.now().toISOString();
    const cards: Card[] = [];

    options?.onProgress?.({ phase: "saving", completed: 0, total: generatedCards.length, cards: generatedCards.length,
      message: `Persisting ${generatedCards.length} cards. Existing cards and review history are preserved.${options?.provider?.kind === "deterministic" ? "" : "\nCheckpoint is retained until all card writes succeed."}` });
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
      options?.onProgress?.({ phase: "saving", completed: cards.length, total: generatedCards.length, cards: cards.length });
    }

    await this.dependencies.completeGeneration?.(root, options);
    options?.onProgress?.({ phase: "done", completed: cards.length, total: cards.length, cards: cards.length,
      message: options?.provider?.kind === "deterministic" ? "Offline card persistence finished." : "Card persistence finished; matching AI checkpoint cleared." });
    return cards;
  }

  async start(root: string, options: StartOptions = {}): Promise<void> {
    const rootPath = projectRoot(root);
    await this.dependencies.initializeStore(rootPath);
    const server = this.dependencies.createServer(this.studyServices(rootPath));
    await this.dependencies.listenServer(server, options.host ?? "localhost", options.port ?? 4173);
  }

  async study(directory?: string): Promise<FrontendServices> {
    return this.studyServices(await this.resolveProject(directory));
  }

  private studyServices(rootPath: string): FrontendServices {
    const cards = this.dependencies.createCardRepository(rootPath);
    const reviews = this.dependencies.createReviewRepository(rootPath);
    return {
      listCards: () => cards.list(),
      project: async () => ({ name: await this.dependencies.readProjectName(rootPath) }),
      getCard: (id) => cards.get(id),
      nextCard: async () => {
        const allCards = await cards.list();
        const states = await Promise.all(allCards.map(({ id }) => reviews.get(id)));
        return this.dependencies.selectNextCard(allCards, states, this.dependencies.now());
      },
      submitReview: (cardId: string, result: ReviewResult) => this.serializeReview(rootPath, cardId, async () => {
        if (!await cards.get(cardId)) throw new Error(`Card not found: ${cardId}`);
        const state = this.dependencies.scheduleReview(
          await reviews.get(cardId),
          result,
          this.dependencies.now(),
        );
        await reviews.save(state);
        return state;
      }),
    };
  }

  async resolveProject(directory = "."): Promise<string> {
    const root = projectRoot(directory);
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

  private serializeReview<T>(root: string, cardId: string, operation: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([root, cardId]);
    // Queue the entire read/schedule/save transaction, not just the write.
    const result = (pendingReviews.get(key) ?? Promise.resolve()).then(operation);
    // A rejected request must reach its caller without poisoning later requests.
    const settled = result.then(() => {}, () => {});
    pendingReviews.set(key, settled);
    void settled.then(() => {
      if (pendingReviews.get(key) === settled) pendingReviews.delete(key);
    });
    return result;
  }
}
