import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createWebServer } from "./server.js";
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

/** Serves the production UI and injected application services from one origin. */
export class FrontendService implements FrontendWorkstream {
  constructor(private readonly webRoot = fileURLToPath(new URL("../dist/web/", import.meta.url))) {}

  createServer(services: FrontendServices): Server {
    return createWebServer(services, this.webRoot);
  }

  renderPage(): string {
    return readFileSync(join(this.webRoot, "index.html"), "utf8");
  }
}
