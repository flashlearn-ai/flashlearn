import type {
  Card,
  CardRepository,
  GeneratedCard,
  ReviewRepository,
  ReviewResult,
  ReviewState,
} from "../../../contracts/index.js";

export interface FrontendServices {
  listCards(): Promise<Card[]>;
  nextCard(): Promise<Card | null>;
  getCard(id: string): Promise<Card | null>;
  submitReview(cardId: string, result: ReviewResult): Promise<ReviewState>;
}

export type ServerHandle = unknown;

export interface CliDependencies {
  initializeStore(root: string): Promise<void>;
  generateCards(root: string): Promise<GeneratedCard[]>;
  createCardRepository(root: string): CardRepository;
  createReviewRepository(root: string): ReviewRepository;
  scheduleReview(state: ReviewState, result: ReviewResult, now?: Date): ReviewState;
  selectNextCard(cards: Card[], states: ReviewState[], now?: Date): Card | null;
  createServer(services: FrontendServices): ServerHandle;
  listenServer(server: ServerHandle, host: string, port: number): Promise<void>;
  now(): Date;
}
