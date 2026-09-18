import type { ReviewResult, Topic } from "./deck";

export const REVIEW_HISTORY_KEY = "flashlearn.review-history.v1";
const MAX_EVENTS = 5_000;

export type ReviewEvent = {
  cardId: string;
  topicId: string;
  topicLabel: string;
  result: ReviewResult;
  reviewedAt: string;
};

export type TopicInsight = Topic & {
  attempts: number;
  successful: number;
  easy: number;
  hard: number;
  incorrect: number;
  successRate: number;
};

type LocalStore = Pick<Storage, "getItem" | "setItem">;

const RESULTS = new Set<ReviewResult>(["easy", "hard", "correct", "incorrect"]);

function isReviewEvent(value: unknown): value is ReviewEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Partial<ReviewEvent>;
  return typeof event.cardId === "string"
    && typeof event.topicId === "string"
    && typeof event.topicLabel === "string"
    && typeof event.result === "string"
    && RESULTS.has(event.result as ReviewResult)
    && typeof event.reviewedAt === "string"
    && !Number.isNaN(Date.parse(event.reviewedAt));
}

export function loadReviewEvents(store: LocalStore = window.localStorage): ReviewEvent[] {
  try {
    const value: unknown = JSON.parse(store.getItem(REVIEW_HISTORY_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter(isReviewEvent) : [];
  } catch {
    return [];
  }
}

export function recordReviewEvent(
  cardId: string,
  topic: Topic,
  result: ReviewResult,
  store: LocalStore = window.localStorage,
  now = new Date(),
): ReviewEvent[] {
  const events = [...loadReviewEvents(store), {
    cardId,
    topicId: topic.id,
    topicLabel: topic.label,
    result,
    reviewedAt: now.toISOString(),
  }].slice(-MAX_EVENTS);
  try {
    store.setItem(REVIEW_HISTORY_KEY, JSON.stringify(events));
  } catch {
    return loadReviewEvents(store);
  }
  return events;
}

export function buildTopicInsights(events: ReviewEvent[]): TopicInsight[] {
  const topics = new Map<string, TopicInsight>();
  for (const event of events) {
    const insight = topics.get(event.topicId) ?? {
      id: event.topicId,
      label: event.topicLabel,
      attempts: 0,
      successful: 0,
      easy: 0,
      hard: 0,
      incorrect: 0,
      successRate: 0,
    };
    insight.label = event.topicLabel;
    insight.attempts += 1;
    if (event.result !== "incorrect") insight.successful += 1;
    if (event.result === "easy") insight.easy += 1;
    if (event.result === "hard") insight.hard += 1;
    if (event.result === "incorrect") insight.incorrect += 1;
    insight.successRate = Math.round((insight.successful / insight.attempts) * 100);
    topics.set(event.topicId, insight);
  }
  return [...topics.values()].sort((left, right) =>
    left.successRate - right.successRate
    || right.hard + right.incorrect - left.hard - left.incorrect
    || left.label.localeCompare(right.label));
}