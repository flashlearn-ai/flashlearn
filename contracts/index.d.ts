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

export type SubmitReviewRequest = {
  cardId: string;
  result: ReviewResult;
};
