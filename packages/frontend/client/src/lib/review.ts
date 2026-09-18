/** Submitting a grade, which `deckSource` deliberately does not cover: it loads
 *  a deck, this writes a review. Kept separate so neither grows into the other. */
import type { ReviewResult } from "./deck";
import { isLiveSource } from "../deckSource";

/** What happened to a grade. `recorded: false` matters: the learning engine can
 *  reject a review, and a card that says "Scheduled" when nothing was stored
 *  tells the user their progress is being kept when it is not. */
export type ReviewOutcome = { recorded: boolean; due: string | null; demo?: boolean };

const TIMEOUT_MS = 10_000;

/** Records the grade and reports the date the learning engine scheduled.
 *
 *  Demo mode records only the in-memory session grade, without network or scheduling. */
export async function submitReview(cardId: string, result: ReviewResult): Promise<ReviewOutcome> {
  if (import.meta.env?.MODE === "demo" || (import.meta.env && !isLiveSource())) return { recorded: false, due: null, demo: true };
  try {
    const response = await fetch("/api/review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cardId, result }),
      // Without this a server that accepts the socket and never answers leaves
      // the card waiting for a due date that never arrives.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { recorded: false, due: null };
    const state: unknown = await response.json();
    if (typeof state !== "object" || state === null) return { recorded: false, due: null };
    const value = state as Record<string, unknown>;
    if (value.cardId !== cardId ||
      ![value.easeFactor, value.intervalDays, value.reviewCount, value.correctCount].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) ||
      (value.nextReview !== undefined && (typeof value.nextReview !== "string" || !Number.isFinite(Date.parse(value.nextReview))))) {
      return { recorded: false, due: null };
    }
    return { recorded: true, due: typeof value.nextReview === "string" ? value.nextReview : null };
  } catch {
    return { recorded: false, due: null };
  }
}
