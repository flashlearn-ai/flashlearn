/** Submitting a grade, which `deckSource` deliberately does not cover: it loads
 *  a deck, this writes a review. Kept separate so neither grows into the other. */
import type { ReviewState } from "../../../../../contracts/index";
import type { ReviewResult } from "./deck";

/** What happened to a grade. `recorded: false` matters: the learning engine can
 *  reject a review, and a card that says "Scheduled" when nothing was stored
 *  tells the user their progress is being kept when it is not. */
export type ReviewOutcome = { recorded: boolean; due: string | null; demo?: boolean };

const TIMEOUT_MS = 10_000;

/** Records the grade and reports the date the learning engine scheduled.
 *
 *  Demo mode records only the in-memory session grade, without network or scheduling. */
export async function submitReview(cardId: string, result: ReviewResult): Promise<ReviewOutcome> {
  if (import.meta.env?.MODE === "demo") return { recorded: false, due: null, demo: true };
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
    const state = await response.json() as ReviewState;
    return { recorded: true, due: state.nextReview ?? null };
  } catch {
    return { recorded: false, due: null };
  }
}
