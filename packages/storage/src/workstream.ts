import type { CardRepository, ReviewRepository } from "../../../contracts/index.js";
import { initializeStore } from "./index.js";
import { cardsPath, reviewPath } from "./paths.js";
import { JsonCardRepository, JsonReviewRepository } from "./repositories.js";

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
    return new JsonCardRepository(cardsPath(root));
  }

  createReviewRepository(root: string): ReviewRepository {
    return new JsonReviewRepository(reviewPath(root));
  }
}
