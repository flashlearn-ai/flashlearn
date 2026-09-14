import { createServer, type Server } from "node:http";
import type { Card, ReviewResult, ReviewState } from "../../../contracts/index.js";

export interface FrontendServices {
  listCards(): Promise<Card[]>;
  nextCard(): Promise<Card | null>;
  getCard(id: string): Promise<Card | null>;
  submitReview(cardId: string, result: ReviewResult): Promise<ReviewState>;
}

/** HTTP server and UI creation owned by the frontend workstream. */
export interface FrontendWorkstream {
  createServer(services: FrontendServices): Server;
  renderPage(): string;
}

/** Simple mock data source Sara can use while building the UI. */
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

/** Sara: fill in the HTTP routes and page without adding business logic. */
export class FrontendService implements FrontendWorkstream {
  createServer(_services: FrontendServices): Server {
    // TODO(Sara): route requests using the injected services.
    return createServer((_request, response) => {
      response.writeHead(204);
      response.end();
    });
  }

  renderPage(): string {
    // TODO(Sara): return the fake Teams HTML application shell.
    return "";
  }
}
