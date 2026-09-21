import type {
  Card,
  CardRepository,
  GeneratedCard,
  ProjectIdentity,
  ReviewRepository,
  ReviewResult,
  ReviewState,
} from "../../../contracts/index.js";

export interface FrontendServices {
  listCards(): Promise<Card[]>;
  nextCard(): Promise<Card | null>;
  getCard(id: string): Promise<Card | null>;
  submitReview(cardId: string, result: ReviewResult): Promise<ReviewState>;
  project(): Promise<ProjectIdentity>;
}

export type ServerHandle = unknown;

export type GenerateOptions = {
  subpath?: string;
  maxFiles?: number;
};

export interface CliDependencies {
  initializeStore(root: string): Promise<void>;
  generateCards(root: string, options?: GenerateOptions): Promise<GeneratedCard[]>;
  createCardRepository(root: string): CardRepository;
  createReviewRepository(root: string): ReviewRepository;
  scheduleReview(state: ReviewState, result: ReviewResult, now?: Date): ReviewState;
  selectNextCard(cards: Card[], states: ReviewState[], now?: Date): Card | null;
  createServer(services: FrontendServices): ServerHandle;
  listenServer(server: ServerHandle, host: string, port: number): Promise<void>;
  isDirectory(path: string): Promise<boolean>;
  /** The project's declared name, or null when it declares none. */
  readProjectName(root: string): Promise<string | null>;
  now(): Date;
}
