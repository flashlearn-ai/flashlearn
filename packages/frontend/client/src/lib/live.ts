import type { Card, CardPreview } from "../../../../../contracts/index";
import { isCard, isPreview } from "../deckSource";

async function get(url: string): Promise<Response> {
  return fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
}

/** Selection belongs to the server. A 404 is the contract's empty due queue. */
export async function nextCard(): Promise<CardPreview | null> {
  const response = await get("/api/cards/next");
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Could not load the next card (${response.status}).`);
  const card: unknown = await response.json();
  if (!isPreview(card)) throw new Error("The server returned an invalid card preview.");
  // Keep the answer out of session state even if a misconfigured server sends it.
  return { id: card.id, question: card.question, source: card.source };
}

export async function revealCard(id: string): Promise<Card> {
  const response = await get(`/api/cards/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`Could not reveal the answer (${response.status}).`);
  const card: unknown = await response.json();
  if (!isCard(card) || card.id !== id) throw new Error("The server returned an invalid answer card.");
  return card;
}
