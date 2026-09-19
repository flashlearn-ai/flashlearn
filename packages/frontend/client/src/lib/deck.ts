/** Pure, framework-free deck logic. Card + ReviewResult are imported from the team's
 *  locked contract (contracts/index.d.ts) so the showcase can't drift from it. */
import type { Card, ReviewResult } from "../../../../../contracts/index";
import type { ReviewOutcome } from "./review";
export type { Card, ReviewResult };

export type Topic = { id: string; label: string };
export type TopicGroup = Topic & { total: number };
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

/** A card with its topic resolved. Classifying once, at the point the deck
 *  arrives, is what keeps grouping, session building and runs agreeing: the
 *  alternative threaded a plan through four functions whose defaults were wrong
 *  for every real caller, and a subset recomputing it produced different topics. */
export type StudyCard = Card & { topic: Topic };

/** Directory prefixes the grouping descends past, because a bucket that holds
 *  most of the deck is not a useful topic. Internal: callers hold `StudyCard`s. */
type TopicPlan = ReadonlySet<string>;

/** Share of the deck a single bucket may hold before it gets split open. */
const DOMINANT = 0.5;

/** The directory a card is grouped under: the shallowest one the plan has not
 *  already split. Never descends onto the file name itself. */
function bucket(card: Card, plan: TopicPlan): string {
  const segments = card.source.path.split("/").filter(Boolean);
  let prefix = "";
  for (let i = 0; i < segments.length - 1; i += 1) {
    const next = prefix ? `${prefix}/${segments[i]}` : segments[i]!;
    if (!plan.has(next)) return next;
    prefix = next;
  }
  return prefix;
}

/** Decides how deep to group. Top-level directories are the starting point; any
 *  bucket holding more than half the deck is opened up a level, repeatedly.
 *
 *  A deck generated from `pkg/scheduler` is entirely under `scheduler/`, which
 *  is one useless topic until it is split into framework, apis and the rest.
 *  A deck from this repository is two thirds under `packages/`, which splits
 *  into the five packages while `contracts/` and root files stay put. */
function planTopics(cards: Card[]): TopicPlan {
  const plan = new Set<string>();
  for (let pass = 0; pass < 8; pass += 1) {
    const counts = new Map<string, number>();
    for (const card of cards) {
      const key = bucket(card, plan);
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const dominant = [...counts].find(([, n]) => n > cards.length * DOMINANT);
    if (!dominant) break;

    const [key] = dominant;
    plan.add(key);
    // A directory with one child is descended through, not abandoned: a deck
    // scoped to `packages/cli` is entirely under `packages/`, then entirely
    // under `packages/cli`, and only branches below that. Stopping at the first
    // narrow link would leave the whole deck in one topic. Only a directory
    // holding no subdirectory at all cannot be opened further.
    const children = new Set(cards.map((card) => bucket(card, plan)).filter((k) => k.startsWith(`${key}/`)));
    if (children.size === 0) {
      plan.delete(key);
      break;
    }
  }
  return plan;
}

/** A card's topic: its tag when extraction supplied one, otherwise the directory
 *  the plan groups it under. */
function deriveTopic(card: Card, plan: TopicPlan): Topic {
  const tag = card.tags?.find((v) => v.trim().length > 0);
  if (tag) return { id: slug(tag), label: prettify(tag) };
  const key = bucket(card, plan);
  if (!key) return { id: "general", label: "General" };
  return { id: slug(key), label: prettify(key.split("/").pop()!) };
}

/** Resolves every card's topic against one plan computed from the whole deck. */
export function classify(cards: Card[]): StudyCard[] {
  const plan = planTopics(cards);
  return cards.map((card) => ({ ...card, topic: deriveTopic(card, plan) }));
}

export function groupByTopic(cards: StudyCard[]): TopicGroup[] {
  const groups = new Map<string, TopicGroup>();
  for (const card of cards) {
    const existing = groups.get(card.topic.id);
    if (existing) existing.total += 1;
    else groups.set(card.topic.id, { ...card.topic, total: 1 });
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** A study session is capped so a large repository stays reviewable. Generating
 *  a mid-sized repo already yields ~1400 cards in a single topic, and an
 *  uncapped run would hand the user every one of them. */
export const SESSION_LIMIT = 12;

/** Cards for the chosen topics, ordered so each topic is one contiguous run.
 *  The run is what the bot announces between topics, and what the pane charts.
 *  Topics take turns filling the session. When there are more topics than slots,
 *  the starting topic rotates too. Cursors count cards actually dealt per topic. */
export function buildSet(cards: StudyCard[], selected: string[], limit = SESSION_LIMIT, rotation = 0, cursors?: ReadonlyMap<string, number>): StudyCard[] {
  // Deduplicated: a repeated id would otherwise take a turn twice per round and
  // emit its cards twice, producing duplicate React keys in the session.
  const selectedIds = [...new Set(selected)];
  const start = selectedIds.length ? (rotation * Math.min(limit, selectedIds.length)) % selectedIds.length : 0;
  const topicIds = [...selectedIds.slice(start), ...selectedIds.slice(0, start)];
  const byTopic = new Map(topicIds.map((id) => [id, [] as StudyCard[]]));
  for (const card of cards) byTopic.get(card.topic.id)?.push(card);

  const quotas = new Map(topicIds.map((id) => [id, 0]));
  let total = 0;
  for (let round = 0; total < limit; round += 1) {
    let placed = false;
    for (const id of topicIds) {
      const list = byTopic.get(id);
      if (!list || round >= list.length || total >= limit) continue;
      quotas.set(id, quotas.get(id)! + 1);
      total += 1;
      placed = true;
    }
    if (!placed) break;
  }
  return topicIds.flatMap((id) => {
    const list = byTopic.get(id)!;
    const quota = quotas.get(id)!;
    const offset = cursors ? cursors.get(id) ?? 0 : rotation * quota;
    return Array.from({ length: quota }, (_, i) => list[(offset + i) % list.length]!);
  });
}

export type Run = Topic & { start: number; cards: StudyCard[] };

/** Split an ordered session into its topic runs. */
export function runsOf(session: StudyCard[]): Run[] {
  const runs: Run[] = [];
  session.forEach((card, index) => {
    const topic = card.topic;
    const last = runs[runs.length - 1];
    if (last && last.id === topic.id) last.cards.push(card);
    else runs.push({ ...topic, start: index, cards: [card] });
  });
  return runs;
}

/** Describes a scheduled date the learning engine returned. Presentation only:
 *  the interval itself is never computed here, because scheduling belongs to the
 *  learning package and a second copy of its table would drift out of step. */
export function dueLabel(nextReview: string | null | undefined, now = new Date()): string | null {
  if (!nextReview) return null;
  const due = new Date(nextReview);
  if (Number.isNaN(due.getTime())) return null;
  const days = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  return due.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function startOfDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/** One card as it appears in a session: the card, the choices it was offered
 *  with, the card its wrong choices were borrowed from, and what the user did.
 *
 *  A single record rather than five arrays indexed by `step`. The arrays had to
 *  stay the same length and the same order, an invariant nothing enforced and
 *  every reader re-derived. */
export type SessionCard = {
  card: StudyCard;
  choices: Choice[];
  /** The card each wrong choice answers. Resolved when the session is dealt so
   *  the card component needs no access to the deck: it was taking the whole
   *  deck as a prop purely to run this lookup. */
  confusable: Map<string, Card>;
  /** How this card is asked. Recall reveals the answer and asks the learner to
   *  rate it; choice grades itself from the option picked. */
  mode: "choice" | "reveal";
  answer: Choice | null;
  grade: ReviewResult | null;
  outcome: ReviewOutcome | null;
};

/** What a session asks for. `mixed` alternates for variety regardless of how
 *  well a card is known; the other two force one kind for the whole session. */
export type Presentation = "mixed" | "choice" | "reveal";

/** Pairs each session card with its choices and the cards they were taken from. */
/** Deals one card: its choices, what each wrong option answers, and whether it
 *  is asked as a question or a recall. `position` drives the `mixed` rotation,
 *  so a session dealt up front and one appended a card at a time alternate the
 *  same way instead of each having its own idea of "every other card". */
export function dealCard(card: StudyCard, pool: Card[], presentation: Presentation, position: number): SessionCard {
  const choices = buildChoices(card, pool);
  const confusable = new Map<string, Card>();
  for (const choice of choices) {
    const from = confusedWith(choice, card, pool);
    if (from) confusable.set(choice.text, from);
  }
  // One option answers itself, so such a card is always recall.
  const askable = choices.length > 1;
  const wanted = presentation === "mixed" ? (position % 2 === 0 ? "choice" : "reveal") : presentation;
  return { card, choices, confusable, mode: askable && wanted === "choice" ? "choice" : "reveal", answer: null, grade: null, outcome: null };
}

/** Pairs each session card with its choices and the cards they were taken from. */
export function dealSession(session: StudyCard[], pool: Card[], presentation: Presentation = "mixed"): SessionCard[] {
  return session.map((card, index) => dealCard(card, pool, presentation, index));
}

/** Correct answers within a run. Lives next to `runsOf`, which produces the
 *  `Run`, because the handoff message and the details pane both report it. */
/** Whether a dealt card was got right. A choice card is judged by the option
 *  picked. A recall card is never offered options, so its own rating is the
 *  only evidence there is: anything but `incorrect` means it was recalled.
 *  Every view scores through this, so a session, a run and the details pane
 *  cannot disagree about the same card. */
export function wasCorrect(entry: SessionCard): boolean {
  return entry.mode === "choice" ? Boolean(entry.answer?.correct) : entry.grade !== null && entry.grade !== "incorrect";
}

/** Whether the learner is finished with a dealt card. */
export function wasAnswered(entry: SessionCard): boolean {
  return entry.mode === "choice" ? entry.answer !== null : entry.grade !== null;
}

export function scoreOf(run: Run, cards: SessionCard[]): number {
  return run.cards.filter((_, i) => {
    const entry = cards[run.start + i];
    return entry ? wasCorrect(entry) : false;
  }).length;
}

/** The card a distractor was borrowed from, so a miss can name the confusion
 *  instead of restating an answer the choice list already shows. */
export function confusedWith(chosen: Choice, card: Card, pool: Card[]): Card | null {
  if (chosen.correct) return null;
  const subjects = documentedSubjects(pool);
  return pool.find((c) => c.id !== card.id && anonymizeAnswer(c.answer, subjects) === chosen.text) ?? null;
}

const LEADING_SUBJECT = /^([A-Za-z_][A-Za-z0-9_]*)\s+([a-z][a-z0-9]*)\b/;
const QUESTION_SUBJECT = /`([A-Za-z_][A-Za-z0-9_]*)(?:\(\))?`/;
const FORM_SUBJECT = /`[^`]+`|"[^"]+"|'[^']+'/g;

/** A question with its subject replaced, so `toYaml()` and `dueLabel()` share a
 *  form while "…cover?" prose does not. Distractors are drawn within a form:
 *  a deck spanning function docs, prose and website copy otherwise offers the
 *  marketing tagline as an answer to what a function does. This deliberately
 *  does not group by topic, so options stay varied across the deck. */
function questionForm(question: string): string {
  return question.trim().toLowerCase().replace(FORM_SUBJECT, "*").replace(/\s+/g, " ");
}

/** Hide documented symbol names in choices without stripping ordinary prose. */
export function anonymizeAnswer(answer: string, subjects?: ReadonlySet<string>): string {
  const trimmed = answer.trim();
  const named = LEADING_SUBJECT.exec(trimmed);
  if (!named) return trimmed;
  const [matched, subject, verb] = named;
  if (subjects && !subjects.has(subject!)) return trimmed;
  const rest = trimmed.slice(matched.length);
  if (!rest.trim()) return trimmed;
  return `${verb!.charAt(0).toUpperCase()}${verb!.slice(1)}${rest}`;
}

function documentedSubjects(pool: Card[]): Set<string> {
  const subjects = new Set<string>();
  for (const card of pool) {
    const subject = QUESTION_SUBJECT.exec(card.question)?.[1];
    if (subject) subjects.add(subject);
  }
  return subjects;
}

/** Fisher-Yates, in place. Shared by candidate selection and choice ordering. */
function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

export function buildChoices(card: Card, pool: Card[], count = 3, rng: () => number = Math.random): Choice[] {
  const subjects = documentedSubjects(pool);
  const correct = anonymizeAnswer(card.answer, subjects);
  const form = questionForm(card.question);
  const seen = new Set<string>([correct]);
  // Same-form answers first. Hand-authored decks phrase every question
  // differently, so the wider pool still backs a question that would otherwise
  // have too few options to ask anything.
  const matching: string[] = [];
  const rest: string[] = [];
  for (const other of pool) {
    if (other.id === card.id) continue;
    const text = anonymizeAnswer(other.answer, subjects);
    if (seen.has(text)) continue;
    seen.add(text);
    (questionForm(other.question) === form ? matching : rest).push(text);
  }
  const distractors = [...shuffle(matching, rng), ...shuffle(rest, rng)].slice(0, Math.max(0, count - 1));
  const choices: Choice[] = [{ text: correct, correct: true }, ...distractors.map((text) => ({ text, correct: false }))];
  return shuffle(choices, rng);
}
