import type { Card, ReviewState } from "../../../contracts/index.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isCard(value: unknown): value is Card {
  if (!isRecord(value)) return false;
  const source = value.source;
  return (
    typeof value.id === "string"
    && typeof value.question === "string"
    && typeof value.answer === "string"
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string"
    && isRecord(source)
    && typeof source.path === "string"
    && typeof source.sha === "string"
    && (value.tags === undefined || isStringArray(value.tags))
  );
}

export function isReviewState(value: unknown): value is ReviewState {
  if (!isRecord(value)) return false;
  return (
    typeof value.cardId === "string"
    && typeof value.easeFactor === "number"
    && typeof value.intervalDays === "number"
    && typeof value.reviewCount === "number"
    && typeof value.correctCount === "number"
    && (value.lastReviewed === undefined || typeof value.lastReviewed === "string")
    && (value.nextReview === undefined || typeof value.nextReview === "string")
  );
}

/** Reject IDs that would corrupt an object used as a keyed map. */
export function isSafeKey(key: string): boolean {
  return key !== "__proto__" && key !== "constructor" && key !== "prototype";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
