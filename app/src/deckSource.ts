import type { Card } from "./lib/deck";
import { DECK } from "./data";

/**
 * Where the app gets its cards. The bundled `DECK` is a fixture so the UI runs
 * with no backend; a real deck comes from the CLI's HTTP API.
 *
 * Selected by `VITE_DECK_SOURCE`:
 *   fixture  bundled sample cards (default)
 *   api      GET /api/cards from a running `flashlearn start`
 *   <path>   any URL returning a Card[] JSON array
 */
export type DeckSource = () => Promise<Card[]>;

/** Endpoint serving the full deck, per contracts/http.md. */
const API_DECK = "/api/cards";

function isCard(value: unknown): value is Card {
  if (typeof value !== "object" || value === null) return false;
  const card = value as Partial<Card>;
  return (
    typeof card.id === "string" &&
    typeof card.question === "string" &&
    typeof card.answer === "string" &&
    typeof card.source?.path === "string"
  );
}

/**
 * Validates at the boundary: the API is untrusted input to this app, and a
 * malformed card would otherwise surface as a blank flashcard mid-session.
 */
export function parseDeck(payload: unknown): Card[] {
  if (!Array.isArray(payload)) throw new Error("Expected the deck to be an array of cards");

  const cards = payload.filter(isCard);
  if (cards.length === 0) throw new Error("The deck contained no usable cards");
  return cards;
}

/** Fetches a deck from `url`, failing with a message the UI can display. */
export async function fetchDeck(url: string): Promise<Card[]> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return parseDeck(await response.json());
}

/**
 * Resolves the configured source. Reading the variable here rather than at
 * module load keeps this testable without stubbing the environment.
 */
export function deckSource(setting: string | undefined = import.meta.env?.VITE_DECK_SOURCE): DeckSource {
  const configured = setting?.trim();

  if (!configured || configured === "fixture") return async () => DECK;
  if (configured === "api") return async () => fetchDeck(API_DECK);
  return async () => fetchDeck(configured);
}
