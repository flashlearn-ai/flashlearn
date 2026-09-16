import type { GeneratedCard } from "../../../contracts/index.js";

/**
 * A card that survives generation but would waste a reviewer's time. Extractors
 * produce cards from whatever a file happens to contain, so filtering is a
 * separate concern from generation and applies to deterministic and
 * endpoint-backed output alike.
 */
export type Rejection = { card: GeneratedCard; reason: string };

export type ValidationResult = {
  cards: GeneratedCard[];
  rejected: Rejection[];
};

/**
 * Minimum characters before an answer is too thin to teach anything. Kept low
 * because real Go doc comments are terse: "Run starts the kubelet main loop."
 * is only 33 characters and is a perfectly good card.
 */
const MIN_ANSWER_LENGTH = 25;

/** Share of answer words that may also appear in the question before it is a restatement. */
const MAX_QUESTION_OVERLAP = 0.6;

/**
 * Locator cards answer "which file defines X", which tests filesystem trivia
 * rather than understanding of the system.
 */
const LOCATOR_QUESTION = /^which file defines the /i;

/**
 * Pronouns and deictic phrases that referred to surrounding code the card does
 * not carry. An answer opening with one of these is unanchored on its own.
 */
const DANGLING_OPENER =
  /^(this|it|its|these|those|that|they|the above|the below|the following|see above|see below|as described above|here|such)\b/i;

/** Words carrying no topical signal, excluded when comparing question and answer. */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "do", "does", "for", "from", "has", "in",
  "is", "of", "on", "or", "that", "the", "to", "what", "when", "which", "with",
]);

/**
 * Lowercase content words. Identifiers are split on camelCase and underscores,
 * because `AllocationManager` restated as "manages allocation" is the exact
 * pattern this catches and an unsplit identifier would never match it.
 */
function contentWords(text: string): string[] {
  return text
    .replace(/[`*_]/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word))
    .map(stem);
}

/**
 * Crude suffix stripping so "manages"/"manager"/"management" collapse to one
 * token. A real stemmer is not worth a dependency for this comparison.
 */
function stem(word: string): string {
  for (const suffix of ["ements", "ement", "ations", "ation", "ings", "ing", "ers", "er", "es", "s"]) {
    if (word.length > suffix.length + 2 && word.endsWith(suffix)) {
      return word.slice(0, word.length - suffix.length);
    }
  }
  return word;
}

/**
 * Fraction of the answer's content words that already appear in the question.
 * A Go doc comment that only re-spaces the identifier name scores near 1.
 */
export function questionOverlap(question: string, answer: string): number {
  const answerWords = contentWords(answer);
  if (answerWords.length === 0) return 1;

  const asked = new Set(contentWords(question));
  const shared = answerWords.filter((word) => asked.has(word)).length;
  return shared / answerWords.length;
}

/** A single reason a card is not worth reviewing, or null when it passes. */
export type CardRule = (card: GeneratedCard) => string | null;

/**
 * The enforced rules. Each returns a reason so rejections can be reported
 * rather than silently discarded.
 */
export const CARD_RULES: Record<string, CardRule> = {
  locator: (card) => (LOCATOR_QUESTION.test(card.question.trim()) ? "locator question" : null),

  shortAnswer: (card) =>
    card.answer.trim().length < MIN_ANSWER_LENGTH ? "answer too short to teach anything" : null,

  restatement: (card) =>
    questionOverlap(card.question, card.answer) > MAX_QUESTION_OVERLAP
      ? "answer restates the question"
      : null,

  danglingContext: (card) =>
    DANGLING_OPENER.test(card.answer.trim()) ? "answer depends on context the card omits" : null,
};

/** Question subject, for `What does \`Subject\` do?` phrasing. */
const QUESTION_SUBJECT = /^What does `([A-Za-z_][A-Za-z0-9_]*)(\(\))?` do\?$/;

/** Leading identifier of a doc comment, which Go convention puts first. */
const ANSWER_SUBJECT = /^([A-Za-z_][A-Za-z0-9_]*)\b/;

/**
 * Repairs a question whose subject is a truncated form of the name its answer
 * uses. Kubernetes declares `type Manager interface` in package `allocation`
 * and documents it as "AllocationManager tracks pod resource allocations", so
 * the generated question asks about `Manager` — meaningless in a repository
 * with hundreds of them — while the answer names the fuller concept.
 *
 * Only the source's own naming is used; nothing is invented. The answer's
 * leading identifier must genuinely extend the question's subject, so
 * `Manager` is repaired to `AllocationManager` but an answer opening on an
 * unrelated identifier is left alone for the other rules to judge.
 */
export function repairVagueQuestion(card: GeneratedCard): GeneratedCard {
  const askedAbout = QUESTION_SUBJECT.exec(card.question.trim());
  if (!askedAbout) return card;

  const [, subject, call = ""] = askedAbout;
  const answered = ANSWER_SUBJECT.exec(card.answer.trim());
  if (!subject || !answered?.[1]) return card;

  const fuller = answered[1];
  const extendsSubject =
    fuller.length > subject.length && fuller.toLowerCase().endsWith(subject.toLowerCase());
  if (!extendsSubject) return card;

  return { ...card, question: `What does \`${fuller}${call}\` do?` };
}

/**
 * Filters cards that would waste review time, and drops questions repeated
 * across files. Deduplication is repository-wide on purpose: the same exported
 * helper documented in several packages otherwise yields the same question
 * many times, which per-file deduplication cannot see.
 *
 * Repair runs before the rules so a question is judged in its final form, and
 * before deduplication so two files that truncate the same name to `Manager`
 * are compared by the names they actually mean.
 */
export function validateCards(input: GeneratedCard[]): ValidationResult {
  const kept: GeneratedCard[] = [];
  const rejected: Rejection[] = [];
  const seenQuestions = new Set<string>();

  for (const original of input) {
    const card = repairVagueQuestion(original);
    const reason = Object.values(CARD_RULES).reduce<string | null>(
      (found, rule) => found ?? rule(card),
      null,
    );
    if (reason) {
      rejected.push({ card, reason });
      continue;
    }

    const key = card.question.trim().toLowerCase().replace(/\s+/g, " ");
    if (seenQuestions.has(key)) {
      rejected.push({ card, reason: "duplicate question across files" });
      continue;
    }

    seenQuestions.add(key);
    kept.push(card);
  }

  return { cards: kept, rejected };
}

/** Count rejections by reason, for reporting what a run filtered and why. */
export function rejectionSummary(rejected: Rejection[]): { reason: string; cards: number }[] {
  const counts = new Map<string, number>();
  for (const entry of rejected) counts.set(entry.reason, (counts.get(entry.reason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, cards]) => ({ reason, cards }))
    .sort((left, right) => right.cards - left.cards || left.reason.localeCompare(right.reason));
}
