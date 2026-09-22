import type { SourceDocument } from "@flashlearn/extraction";
import type { Candidate } from "./card-quality.js";

const PROCEDURAL = /demo|quickstart|install|prerequisite|getting started|getting resources|running the cli|setup|deploy|tearing down|uninstall|community|contribut|developing|license|reference|example|supported.*releases|north star|what this shows|how to use|how to run|flags/i;
const DEPENDENT = /^(?:this|that|these|those|it|they|here|there|also|however|for example|see |note:|we |you |the following)\b/i;
const INCOMPLETE = /:\s*$|(?:\.\.\.|…)\s*$|\b(?:below|above|following|as follows|for example|see also)\b|https?:\/\/|\$\{|\[!|\b(?:TODO|FIXME)\b/i;
const SIGNAL = /\b(?:because|prevent|avoid|ensure|requires?|must|only|unless|instead|before|after|when|if|owns?|responsib|preserv|restore|snapshot|isolat|lifecycle|rout|schedul|retr|dispatch|persistent|immutable)\w*/i;
const QUALIFICATION = /\b(?:planned|proposed|aspirational|experimental|deprecated|unsupported|unimplemented|not (?:yet )?(?:implemented|supported|available)|only|unless|except|however|provided that|must|requires?|does not|cannot|never)\b/i;

/** Conservative extractive recall: question templates over complete source prose,
 * not invented explanations or fragments produced by deleting fenced examples. */
export function heuristicCards(document: SourceDocument): Candidate[] {
  if (!/\.md$/i.test(document.path)) return commentCards(document);
  if (/^(?:tools|demos|hack)\//.test(document.path)) return [];
  const cards: Candidate[] = [];
  const title = clean(/^#\s+(.+)$/m.exec(document.content)?.[1] ?? document.path);
  const warning = /aspirational|not yet implemented/i.test(document.content.slice(0, 1500));
  let heading = "";
  let blockedDepth = 0;
  let fence: string | undefined;
  let paragraph: string[] = [];
  const fallbackCards = new Map<string, Candidate>();
  const flush = () => {
    if (paragraph.length && !blockedDepth) {
      const raw = paragraph.join(" ");
      const definition = /^(?:[-*+]\s+)?(?:\*\*([^*]+)\*\*|`([^`]+)`)\s*(?:\([^)]*\))?\s*:\s*(.+)$/.exec(raw);
      const term = definition ? clean(definition[1] ?? definition[2]!) : undefined;
      const text = definition ? `${term}: ${clean(definition[3]!)}` : clean(raw);
      const excerpt = recallExcerpt(text);
      if (usable(excerpt) && SIGNAL.test(excerpt) && !(term && (/^(note|warning|tip|important)$/i.test(term) || term.split(/\s+/).length > 6)) && (!/^[-*+]\s/.test(raw) || definition)) {
        const topic = term ?? heading;
        let question: string | undefined;
        let fallback = false;
        if (term && term.length <= 65) question = `What does ${term} mean in ${title}?`;
        else {
          const subject = passageSubject(excerpt);
          if (subject && subject.replace(/`/g, "").toLowerCase() !== title.replace(/`/g, "").toLowerCase()) {
            question = `What behavior or constraint applies to ${subject} under ${heading || title}?`;
          } else if (/^(?:what|why|how|when)\b/i.test(heading)) {
            question = heading.replace(/\?*$/, "?"); fallback = true;
          } else if (topic && topic.length < 85 && !/^(overview|introduction|notes|resources|summary|details|system|components|types)$/i.test(topic)) {
            question = `What behavior or constraint is documented for ${topic} in ${title}?`; fallback = true;
          }
        }
        if (question) {
          const card: Candidate = {
          question: `According to ${document.path}, ${question.replace(/^./, (s) => s.toLowerCase())}`,
          answer: (warning ? "Documented design (parts may be unimplemented): " : "") + excerpt,
          source: { path: document.path, sha: document.sha }, goal: term ? "architecture" : /because|prevent|avoid/i.test(excerpt) ? "rationale" : "invariant",
          concept: `${topic}: ${excerpt.slice(0, 70)}`,
          };
          if (fallback) {
            // If no distinct subject is recoverable, intentionally choose one
            // representative passage instead of leaving this to exact deduplication.
            const prior = fallbackCards.get(heading);
            if (!prior || passageScore(card.answer) > passageScore(prior.answer)) fallbackCards.set(heading, card);
          } else cards.push(card);
        }
      }
    }
    paragraph = [];
  };
  for (const line of document.content.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) { flush(); if (!fence) fence = marker[0]; else if (marker[0] === fence) fence = undefined; continue; }
    if (fence) continue;
    const h = /^(#{1,6})\s+(.+)$/.exec(line);
    if (h) {
      flush();
      const depth = h[1]!.length;
      if (blockedDepth && depth <= blockedDepth) blockedDepth = 0;
      heading = clean(h[2]!);
      if (!blockedDepth && PROCEDURAL.test(heading)) blockedDepth = depth;
      continue;
    }
    if (!line.trim() || /^\s*(?:\||>|!\[|\[!|---|\d+[.)]\s)/.test(line)) { flush(); continue; }
    if (/^\s*[-*+]\s/.test(line)) flush(); // each definition/list item stands alone
    paragraph.push(line.trim());
  }
  flush();
  return [...cards, ...fallbackCards.values()];
}

function clean(text: string): string {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim();
}

function completeSentences(text: string): string[] {
  // Segment without skipping prefixes or losing decimal/abbreviation fragments.
  // Never filter individual sentences: that could leave a dependent tail behind.
  const segments = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)].map(({ segment }) => segment.trim());
  return segments.filter((segment) => /[.!?]$/.test(segment));
}

function recallExcerpt(text: string): string {
  // Qualifications may follow the first two sentences, even as an unfinished
  // tail. Keep the entire paragraph (or let usable reject it), never hide them.
  return QUALIFICATION.test(text) ? text : completeSentences(text).slice(0, 2).join(" ");
}

function passageSubject(text: string): string | undefined {
  const subject = /^(?:The |An? )?((?:`[^`]+`|[A-Za-z][\w'-]*)(?:\s+(?:`[^`]+`|[A-Za-z][\w'-]*)){0,4}?)\s+(?:is|are|provides?|implements?|manages?|maps?|uses?|owns?|tracks?|represents?|reserves?|persists?|restores?|must|should|can|cannot|requires?|retries|retry|prevents?|ensures?)\b/.exec(text)?.[1];
  return subject && !DEPENDENT.test(subject) ? subject : undefined;
}

function passageScore(text: string): number {
  return (QUALIFICATION.test(text) ? 1000 : 0) + (/because|prevent|avoid/i.test(text) ? 500 : 0) + text.length;
}

function usable(text: string): boolean {
  return text.length >= 60 && text.length <= 500 && !DEPENDENT.test(text) && !INCOMPLETE.test(text)
    && (text.match(/\(/g)?.length ?? 0) === (text.match(/\)/g)?.length ?? 0)
    && !/badge|officially supported|vulnerability rewards|copyright|all rights reserved/i.test(text)
    && /[.!?]$/.test(text) && !/\b(?:two|three|four|five|six|several) (?:steps|conditions|ways|options)\b/i.test(text);
}

function commentCards(document: SourceDocument): Candidate[] {
  if (/^(?:tools|demos|hack)\//.test(document.path)) return [];
  const comments = document.content.match(/(?:^\s*\/\/[^\n]*(?:\n|$))+/gm) ?? [];
  const js = [...document.content.matchAll(/\/\*\*([\s\S]*?)\*\//g)].map((match) => match[1]!.split("\n").map((line) => line.replace(/^\s*\*\s?/, "")).join("\n"));
  const result: Candidate[] = [];
  for (const comment of [...comments.map((block) => block.replace(/^\s*\/\/ ?/gm, "")), ...js]) {
    if (/Copyright|Licensed under|@deprecated\b/.test(comment)) continue;
    // JSDoc annotations (including their continuation lines) are metadata, not
    // a reason to discard the preceding useful summary.
    const tagStart = comment.search(/^\s*@\w+/m);
    const prose = tagStart < 0 ? comment : comment.slice(0, tagStart);
    if (tagStart >= 0 && QUALIFICATION.test(comment.slice(tagStart))) continue;
    const paragraphs = prose.split(/\n\s*\n/).map((part) => clean(part));
    const first = paragraphs[0] ?? "";
    const subject = /^(?:Package )?([A-Z_a-z][\w.]*)\s+(?:is|are|implements|provides|holds|tracks|represents|manages|starts|returns|creates|ensures|controls|coordinates)\b/.exec(first)?.[1];
    if (!subject || /^(This|It|The|A|An|We|They)$/i.test(subject)) continue;
    let answer = QUALIFICATION.test(prose) ? clean(prose) : recallExcerpt(first);
    const rationale = paragraphs.slice(1).find((p) => /because|prevent|avoid|must|only|instead/i.test(p) && usable(p));
    if (rationale && !QUALIFICATION.test(prose) && answer.length + rationale.length < 500) answer += " " + rationale;
    if (!usable(answer) || !SIGNAL.test(answer)) continue;
    if (/Name$|Label$|Path$|Port$|Timeout$|^should[A-Z]|^New[A-Z]|^Get[A-Z]/.test(subject) && !/because|prevent|avoid|instead|must not/i.test(answer)) continue;
    result.push({ question: `What responsibility or constraint does \`${subject}\` have in ${document.path}?`, answer,
      source: { path: document.path, sha: document.sha }, goal: "invariant", concept: `${subject} responsibility` });
  }
  return result;
}
