/** Pure, framework-free deck logic. Card + ReviewResult are imported from the team's
 *  locked contract (contracts/index.d.ts) so the showcase can't drift from it. */
import type { Card, ReviewResult } from "../../../contracts/index";
export type { Card, ReviewResult };

export type Topic = { id: string; label: string };
export type TopicGroup = Topic & { total: number; cardIds: string[] };
export type Choice = { text: string; correct: boolean };

const ACRONYMS = new Set(["cli", "api", "ui", "ux", "http", "id", "ai", "rp", "sha"]);

function slug(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function prettify(segment: string): string {
  return segment
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((w) => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function deriveTopic(card: Card): Topic {
  const tag = card.tags?.find((v) => v.trim().length > 0);
  if (tag) return { id: slug(tag), label: prettify(tag) };
  const segments = card.source.path.split("/").filter(Boolean);
  if (segments.length <= 1) return { id: "general", label: "General" };
  const first = segments[0]!;
  const segment = first === "packages" && segments[1] ? segments[1]! : first;
  return { id: slug(segment), label: prettify(segment) };
}

export function groupByTopic(cards: Card[]): TopicGroup[] {
  const groups = new Map<string, TopicGroup>();
  for (const card of cards) {
    const t = deriveTopic(card);
    const existing = groups.get(t.id);
    if (existing) existing.cardIds.push(card.id);
    else groups.set(t.id, { ...t, total: 0, cardIds: [card.id] });
  }
  const result = [...groups.values()];
  for (const g of result) g.total = g.cardIds.length;
  return result.sort((a, b) => a.label.localeCompare(b.label));
}

export function buildSet(cards: Card[], topicIds: string[]): Card[] {
  const selected = new Set(topicIds);
  return cards.filter((c) => selected.has(deriveTopic(c).id));
}

export function buildChoices(card: Card, pool: Card[], count = 3, rng: () => number = Math.random): Choice[] {
  const correct = card.answer;
  const seen = new Set<string>([correct]);
  const distractors: string[] = [];
  for (const other of pool) {
    if (seen.has(other.answer)) continue;
    seen.add(other.answer);
    distractors.push(other.answer);
    if (distractors.length >= count - 1) break;
  }
  const choices: Choice[] = [{ text: correct, correct: true }, ...distractors.map((text) => ({ text, correct: false }))];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = choices[i]!;
    choices[i] = choices[j]!;
    choices[j] = a;
  }
  return choices;
}
