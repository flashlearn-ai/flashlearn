import type { Card, CardRepository, ReviewRepository, ReviewState } from "../../../contracts/index.js";

/** Store lifecycle and repository factories owned by storage. */
export interface StorageWorkstream {
  initialize(root: string): Promise<void>;
  createCardRepository(root: string): CardRepository;
  createReviewRepository(root: string): ReviewRepository;
}

/** Sagar: replace these empty operations with JSON card persistence. */
export class StarterCardRepository implements CardRepository {
  async save(_card: Card): Promise<void> {
    // TODO(Sagar): insert or update the card.
  }

  async get(_id: string): Promise<Card | null> {
    // TODO(Sagar): return the matching card.
    return null;
  }

  async list(): Promise<Card[]> {
    // TODO(Sagar): return every stored card.
    return [];
  }

  async delete(_id: string): Promise<void> {
    // TODO(Sagar): remove the matching card.
  }
}

/** Sagar: replace these operations with JSON review persistence. */
export class StarterReviewRepository implements ReviewRepository {
  async get(cardId: string): Promise<ReviewState> {
    // TODO(Sagar): load state or return this default when none exists.
    return {
      cardId,
      easeFactor: 2.5,
      intervalDays: 0,
      reviewCount: 0,
      correctCount: 0,
    };
  }

  async save(_state: ReviewState): Promise<void> {
    // TODO(Sagar): store review state by card ID.
  }
}

export class StorageService implements StorageWorkstream {
  async initialize(_root: string): Promise<void> {
    // TODO(Sagar): create the three .flashlearn JSON files if absent.
  }

  createCardRepository(_root: string): CardRepository {
    return new StarterCardRepository();
  }

  createReviewRepository(_root: string): ReviewRepository {
    return new StarterReviewRepository();
  }
}
