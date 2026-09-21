import type {
  Card,
  CardRepository,
  GeneratedCard,
  ReviewRepository,
  ReviewResult,
  ReviewState,
} from "../../../../contracts/index.js";
import type { CliDependencies, FrontendServices, GenerateOptions, ServerHandle } from "../../src/dependencies.js";

export class MemoryCardRepository implements CardRepository {
  readonly cards = new Map<string, Card>();
  readonly saved: Card[] = [];

  constructor(initial: Card[] = []) {
    initial.forEach((card) => this.cards.set(card.id, card));
  }

  async save(card: Card): Promise<void> {
    this.cards.set(card.id, card);
    this.saved.push(card);
  }

  async get(id: string): Promise<Card | null> {
    return this.cards.get(id) ?? null;
  }

  async list(): Promise<Card[]> {
    return [...this.cards.values()];
  }

  async delete(id: string): Promise<void> {
    this.cards.delete(id);
  }
}

export class MemoryReviewRepository implements ReviewRepository {
  readonly states = new Map<string, ReviewState>();
  readonly saved: ReviewState[] = [];

  async get(cardId: string): Promise<ReviewState> {
    return this.states.get(cardId) ?? {
      cardId,
      easeFactor: 2.5,
      intervalDays: 0,
      reviewCount: 0,
      correctCount: 0,
    };
  }

  async save(state: ReviewState): Promise<void> {
    this.states.set(state.cardId, state);
    this.saved.push(state);
  }
}

export class RecordingDependencies implements CliDependencies {
  generatedCards: GeneratedCard[] = [];
  initializedRoots: string[] = [];
  generatedRoots: string[] = [];
  generationOptions: Array<GenerateOptions | undefined> = [];
  cardRepositories = new Map<string, MemoryCardRepository>();
  reviewRepositories = new Map<string, MemoryReviewRepository>();
  frontendServices?: FrontendServices;
  selectedCards?: { cards: Card[]; states: ReviewState[]; now?: Date };
  scheduledReviews: Array<{ state: ReviewState; result: ReviewResult; now?: Date }> = [];
  listenCalls: Array<{ server: ServerHandle; host: string; port: number }> = [];
  currentTime = new Date("2026-01-02T03:04:05.000Z");
  server = { kind: "fake-server" };
  directories = new Set<string>();
  /** What the project declares itself to be, and every root asked about it. */
  projectName: string | null = null;
  projectNameReads: string[] = [];

  async initializeStore(root: string): Promise<void> {
    this.initializedRoots.push(root);
  }

  async generateCards(root: string, options?: GenerateOptions): Promise<GeneratedCard[]> {
    this.generatedRoots.push(root);
    this.generationOptions.push(options);
    return this.generatedCards;
  }

  createCardRepository(root: string): MemoryCardRepository {
    let repository = this.cardRepositories.get(root);
    if (!repository) {
      repository = new MemoryCardRepository();
      this.cardRepositories.set(root, repository);
    }
    return repository;
  }

  createReviewRepository(root: string): MemoryReviewRepository {
    let repository = this.reviewRepositories.get(root);
    if (!repository) {
      repository = new MemoryReviewRepository();
      this.reviewRepositories.set(root, repository);
    }
    return repository;
  }

  scheduleReview(state: ReviewState, result: ReviewResult, now?: Date): ReviewState {
    this.scheduledReviews.push({ state, result, now });
    return {
      ...state,
      reviewCount: state.reviewCount + 1,
      correctCount: state.correctCount + (result === "incorrect" ? 0 : 1),
      lastReviewed: now?.toISOString(),
    };
  }

  selectNextCard(cards: Card[], states: ReviewState[], now?: Date): Card | null {
    this.selectedCards = { cards, states, now };
    return cards[0] ?? null;
  }

  createServer(services: FrontendServices): ServerHandle {
    this.frontendServices = services;
    return this.server;
  }

  async listenServer(server: ServerHandle, host: string, port: number): Promise<void> {
    this.listenCalls.push({ server, host, port });
  }

  async isDirectory(path: string): Promise<boolean> {
    return this.directories.has(path);
  }

  async readProjectName(root: string): Promise<string | null> {
    this.projectNameReads.push(root);
    return this.projectName;
  }

  now(): Date {
    return new Date(this.currentTime);
  }
}

export const GENERATED_CARD: GeneratedCard = {
  question: "What initializes FlashLearn?",
  answer: "The init command.",
  source: { path: "src/app.ts", sha: "abc123" },
};
