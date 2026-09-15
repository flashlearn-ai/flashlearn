import { join, resolve } from "node:path";

/** Stores the `.flashlearn/` layout; callers pass only a project root. */
export function storeRoot(root: string): string {
  return join(resolve(root), ".flashlearn");
}

export function cardsPath(root: string): string {
  return join(storeRoot(root), "cards.json");
}

export function reviewPath(root: string): string {
  return join(storeRoot(root), "review.json");
}

export function settingsPath(root: string): string {
  return join(storeRoot(root), "settings.json");
}
