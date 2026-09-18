import type { Server } from "node:http";
import type { Card, ProjectIdentity, ReviewResult, ReviewState } from "../../../contracts/index.js";

export interface FrontendServices {
  listCards(): Promise<Card[]>;
  nextCard(): Promise<Card | null>;
  getCard(id: string): Promise<Card | null>;
  submitReview(cardId: string, result: ReviewResult): Promise<ReviewState>;
  /** Which project this deck came from. Optional: a composition that does not
   *  know reports no name, which is also what a project declaring none reports. */
  project?(): Promise<ProjectIdentity>;
}

/** HTTP server and UI creation owned by the frontend workstream. */
export interface FrontendWorkstream {
  createServer(services: FrontendServices): Server;
  renderPage(): string;
}

/** Simple mock data source for building the UI without a generated project. */
export class MockFrontendServices implements FrontendServices {
  async listCards(): Promise<Card[]> {
    return [];
  }

  async nextCard(): Promise<Card | null> {
    return null;
  }

  async getCard(_id: string): Promise<Card | null> {
    return null;
  }

  async project(): Promise<ProjectIdentity> {
    return { name: null };
  }

  async submitReview(cardId: string, _result: ReviewResult): Promise<ReviewState> {
    return {
      cardId,
      easeFactor: 2.5,
      intervalDays: 0,
      reviewCount: 0,
      correctCount: 0,
    };
  }
}
