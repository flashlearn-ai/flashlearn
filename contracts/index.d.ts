/** Locked cross-package data and port contracts. Changes require all owners' review. */
export type Card = {
  id: string;
  question: string;
  answer: string;
  source: {
    path: string;
    sha: string;
  };
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};

export type GeneratedCard = Pick<Card, "question" | "answer" | "source">;

export type ReviewState = {
  cardId: string;
  easeFactor: number;
  intervalDays: number;
  lastReviewed?: string;
  nextReview?: string;
  reviewCount: number;
  correctCount: number;
};

export type ReviewResult = "easy" | "hard" | "correct" | "incorrect";

export interface CardRepository {
  save(card: Card): Promise<void>;
  get(id: string): Promise<Card | null>;
  list(): Promise<Card[]>;
  delete(id: string): Promise<void>;
}

export interface ReviewRepository {
  get(cardId: string): Promise<ReviewState>;
  save(state: ReviewState): Promise<void>;
}

export type CardPreview = Omit<Card, "answer" | "tags" | "createdAt" | "updatedAt">;

/** Which project a deck was generated from, for a client that would otherwise
 *  show only generic topic names. `name` is null when the project declares none;
 *  it is never inferred from a directory name or from prose, both of which are
 *  wrong often enough to put a false title in the most prominent place. */
export type ProjectIdentity = {
  name: string | null;
};

export type SubmitReviewRequest = {
  cardId: string;
  result: ReviewResult;
};
