import { validateCards } from "@flashlearn/extraction";
import type { GeneratedCard } from "../../../contracts/index.js";
import { subsystem } from "./source-selection.js";

export type LearningGoal = "architecture" | "flow" | "rationale" | "invariant" | "failure";
export type Candidate = GeneratedCard & { goal?: LearningGoal; concept?: string };
const GENERIC = /^(?:what does ["“].*["”] cover\?|(?:how|what|why) (?:does|is) (?:Load|Create|New|Run|Handler|Config|Service)\b(?![.`]))/i;
const INCOMPLETE = /(?:\.\.\.|…)\s*$|(?:the following|listed below|shown above|see (?:the )?(?:table|code|example)|as follows)\b|:\s*$|\b(?:for example|vs\.)\s*(?:$|This)/i;
const TRIVIA = /(?:what|which).*(?:default port|service name|byte values|output format|file defines|file contains)/i;

export function qualityReason(card: GeneratedCard): string | null {
  const question = card.question.replace(/^According to [^,]+, /, "");
  if (GENERIC.test(question)) return "vague question";
  if (/what is explained about (?:introduction|overview|notes|references|decisions|resources|getting started)\?$/i.test(question)) return "generic section heading";
  if (INCOMPLETE.test(card.answer)) return "incomplete answer";
  if (TRIVIA.test(question)) return "constant/locator trivia";
  if (card.answer.length > 650) return "overloaded answer";
  const count = /\b(two|three|four|five|six|seven|eight|\d+) (?:steps|stages|conditions|checks|reasons)\b/i.exec(card.question);
  if (count) {
    const expected = Number(count[1]) || ["", "", "two", "three", "four", "five", "six", "seven", "eight"].indexOf(count[1]!.toLowerCase());
    const numbered = [...card.answer.matchAll(/(?:^|\s)\d+[.)]\s/g)].length;
    const clauses = card.answer.split(/;\s*/).length;
    if ((numbered > 1 && numbered !== expected) || (clauses > 1 && clauses !== expected)) return "list count mismatch";
  }
  return null;
}

const STOP = new Set("a an the is are of to for and or in on by with how why what does do its it this that as from when which can be".split(" "));
function words(text: string): Set<string> {
  return new Set((text.replace(/^According to [^,]+, /, "").toLowerCase().match(/[a-z][a-z0-9]+/g) ?? []).filter((word) => !STOP.has(word)).map((word) => word.replace(/(?:ing|ed|s)$/, "")));
}
function similar(a: string, b: string): boolean {
  const left = words(a), right = words(b);
  if (left.size < 4 || right.size < 4) return a.toLowerCase() === b.toLowerCase();
  const intersection = [...left].filter((word) => right.has(word)).length;
  return 2 * intersection / (left.size + right.size) >= 0.8;
}

/** Rank before capping, with foundation coverage and limits on source dominance. */
export function selectCards(candidates: Candidate[], limit = 100): { cards: GeneratedCard[]; rejected: number } {
  const valid = validateCards(candidates).cards;
  const metadata = new Map(candidates.map((card) => [card.source.path + "\0" + card.question, card]));
  const scored = valid.filter((card) => !qualityReason(card)).map((card) => {
    const meta = metadata.get(card.source.path + "\0" + card.question);
    const foundation = meta?.goal === "architecture" || /(^|\/)(readme|glossary)\.md$/i.test(card.source.path);
    return { card, meta, score: (foundation ? 100 : 0) + (/^why\b|prevent|trade.?off|fail|instead|happen|differ/i.test(card.question) ? 30 : 0) + (meta?.goal ? 10 : 0) };
  }).sort((a, b) => b.score - a.score);
  const chosen: typeof scored = [];
  const sourceCounts = new Map<string, number>(), groupCounts = new Map<string, number>();
  for (const item of scored) {
    if (chosen.length >= limit) break;
    const path = item.card.source.path, group = subsystem(path);
    if ((sourceCounts.get(path) ?? 0) >= 8 || (groupCounts.get(group) ?? 0) >= 25) continue;
    if (chosen.some((prior) => similar(item.card.question, prior.card.question) || similar(item.card.answer, prior.card.answer)
      || (item.meta?.concept && prior.meta?.concept && item.meta.goal === prior.meta.goal && similar(item.meta.concept, prior.meta.concept)))) continue;
    chosen.push(item);
    sourceCounts.set(path, (sourceCounts.get(path) ?? 0) + 1);
    groupCounts.set(group, (groupCounts.get(group) ?? 0) + 1);
  }
  return { cards: chosen.map(({ card }) => ({ question: card.question, answer: card.answer, source: card.source })), rejected: candidates.length - chosen.length };
}
