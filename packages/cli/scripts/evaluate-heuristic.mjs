import { performance } from "node:perf_hooks";
import { resolve } from "node:path";
import { ExtractionService, deterministicExtractor } from "@flashlearn/extraction";
import { classifySources } from "../dist/source-selection.js";
import { heuristicCards } from "../dist/heuristic.js";
import { selectCards } from "../dist/card-quality.js";

// Read-only comparison: print aggregate quality proxies, never save cards/source.
const started = performance.now();
const documents = classifySources(await new ExtractionService().scanRepository(resolve(process.argv[2] ?? "."))).ranked.slice(0, 80);
const baseline = (await Promise.all(documents.map((document) => deterministicExtractor().extract(document)))).flat();
for (const card of baseline) {
  const heading = /^What does "(.+)" cover\?$/.exec(card.question)?.[1];
  if (heading) card.question = `According to ${card.source.path}, what is explained about ${heading}?`;
}
function metrics(cards) {
  return {
    cards: cards.length,
    genericHeading: cards.filter((card) => /what is explained about/.test(card.question)).length,
    toolOrDemo: cards.filter((card) => /^(tools|demos)\//.test(card.source.path)).length,
    badge: cards.filter((card) => /!\[|shields.io/.test(card.answer)).length,
    danglingList: cards.filter((card) => /\b\d+\.\s*$|:\s*$|\*\*Flags:\*\*/.test(card.answer)).length,
    glossary: cards.filter((card) => /glossary\.md$/i.test(card.source.path)).length,
    averageAnswerLength: cards.length ? Math.round(cards.reduce((total, card) => total + card.answer.length, 0) / cards.length) : 0,
  };
}
console.log(JSON.stringify({ baseline: metrics(selectCards(baseline).cards), tuned: metrics(selectCards(documents.flatMap(heuristicCards)).cards), elapsedMs: Math.round(performance.now() - started), note: "Rule-based quality proxies, not a factual accuracy score. No model calls or persisted cards." }, null, 2));
