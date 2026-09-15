import { join } from "node:path";
import type { CardRepository, ReviewRepository } from "../../../contracts/index.js";
import { initializeStore, JsonCardRepository, JsonReviewRepository } from "./json.js";

/** Store lifecycle and repository factories owned by storage. */
export interface StorageWorkstream {
  initialize(root: string): Promise<void>;
  createCardRepository(root: string): CardRepository;
  createReviewRepository(root: string): ReviewRepository;
}

export class StorageService implements StorageWorkstream {
  initialize(root: string): Promise<void> {
    return initializeStore(root);
  }

  createCardRepository(root: string): CardRepository {
    return new JsonCardRepository(join(root, ".flashlearn", "cards.json"));
  }

  createReviewRepository(root: string): ReviewRepository {
    return new JsonReviewRepository(join(root, ".flashlearn", "review.json"));
  }
}
