type Excerpt = { lines: string; code: string };

/** Only the sample deck ships excerpts, so the card component cannot import
 *  them directly without pulling the whole demo deck into the live bundle.
 *  The deck source registers them when it loads a deck that has them; a live
 *  card finds nothing here and the source panel shows attribution alone. */
let registry: Record<string, Excerpt> = {};

export function registerExcerpts(excerpts: Record<string, Excerpt>): void {
  registry = excerpts;
}

export function excerptFor(cardId: string): Excerpt | undefined {
  return registry[cardId];
}
