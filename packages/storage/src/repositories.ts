import type { Card, CardRepository, ReviewRepository, ReviewState } from "../../../contracts/index.js";
import { readJson, updateJson } from "./json.js";
import { isCard, isReviewState, isSafeKey } from "./validate.js";

export const DEFAULT_REVIEW_STATE = (cardId: string): ReviewState => ({
  cardId,
  easeFactor: 2.5,
  intervalDays: 0,
  reviewCount: 0,
  correctCount: 0,
});

function parseCards(value: unknown): Card[] {
  return Array.isArray(value) ? value.filter(isCard) : [];
}

function parseStates(value: unknown): Record<string, ReviewState> {
  const states: Record<string, ReviewState> = Object.create(null);
  if (typeof value === "object" && value !== null) {
    for (const [key, state] of Object.entries(value)) {
      if (isSafeKey(key) && isReviewState(state)) states[key] = state;
    }
  }
  return states;
}

export class JsonCardRepository implements CardRepository {
  constructor(private readonly path: string) {}

  async save(card: Card): Promise<void> {
    await updateJson(this.path, (current) => {
      const cards = parseCards(current);
      const index = cards.findIndex(({ id }) => id === card.id);
      if (index === -1) cards.push(card);
      else cards[index] = card;
      return cards;
    });
  }

  async get(id: string): Promise<Card | null> {
    return (await this.list()).find((card) => card.id === id) ?? null;
  }

  async list(): Promise<Card[]> {
    return parseCards(await readJson<unknown>(this.path, []));
  }

  async delete(id: string): Promise<void> {
    await updateJson(this.path, (current) => parseCards(current).filter((card) => card.id !== id));
  }
}

export class JsonReviewRepository implements ReviewRepository {
  constructor(private readonly path: string) {}

  async get(cardId: string): Promise<ReviewState> {
    const states = parseStates(await readJson<unknown>(this.path, {}));
    return states[cardId] ?? DEFAULT_REVIEW_STATE(cardId);
  }

  async save(state: ReviewState): Promise<void> {
    if (!isSafeKey(state.cardId)) throw new Error(`Unsafe card ID: ${state.cardId}`);
    await updateJson(this.path, (current) => {
      const states = parseStates(current);
      states[state.cardId] = state;
      return states;
    });
  }
}
