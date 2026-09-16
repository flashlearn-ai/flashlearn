import type { Card, CardPreview, ReviewResult, ReviewState } from "../../../contracts/index.js";

export type { Card, CardPreview, ReviewResult, ReviewState };
export interface StudyClient {
  list(): Promise<Card[]>;
  next(): Promise<CardPreview | null>;
  reveal(id: string): Promise<Card>;
  review(cardId: string, result: ReviewResult): Promise<ReviewState | null>;
}

export function createApiClient(request: typeof fetch = fetch): StudyClient {
  async function json<T>(path: string, options?: RequestInit, emptyOn404 = false): Promise<T> {
    const response = await request(path, options);
    if (response.status === 404 && emptyOn404) return null as T;
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? `Request failed (${response.status})`);
    }
    return response.json() as Promise<T>;
  }
  return {
    list: () => json<Card[]>("/api/cards"),
    next: () => json<CardPreview | null>("/api/cards/next", undefined, true),
    reveal: (id) => json<Card>(`/api/cards/${encodeURIComponent(id)}`),
    review: (cardId, result) => json<ReviewState>("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId, result }),
    }),
  };
}
