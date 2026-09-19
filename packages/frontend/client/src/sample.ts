import type { Card } from "./lib/deck";

/** Hand-authored public sample deck, selected explicitly by showcase mode.
 *
 *  Every question, answer, path and excerpt here is checked against the working
 *  tree by `test/sample-deck.test.ts`. A card that cites a file that does not
 *  exist, or quotes a line that is not in it, fails the build — this deck used
 *  to invent both, which is indefensible in a product that sells attribution. */
function card(id: string, topic: string, question: string, answer: string, path: string): Card {
  return { id, question, answer, source: { path, sha: SAMPLE_SHA }, tags: [topic], createdAt: SAMPLE_TIME, updatedAt: SAMPLE_TIME };
}

/** The sample deck is not generated from a commit, so it cites none. The client
 *  omits attribution rather than printing a SHA nobody can look up. */
const SAMPLE_SHA = "unknown";
const SAMPLE_TIME = "2026-09-16T00:00:00Z";

export const SAMPLE_DECK: Card[] = [
  card("cli-1", "CLI", "Which package composes the concrete implementations?", "packages/cli, the composition root", "packages/cli/src/production.ts"),
  card("cli-2", "CLI", "Where does the CLI resolve a project's .flashlearn directory?", "flashlearnRoot(), in the CLI's paths module", "packages/cli/src/paths.ts"),
  card("ext-1", "Extraction", "Which file extensions does extraction scan?", ".go, .js, .jsx, .md, .ts and .tsx", "packages/extraction/src/extractor.ts"),
  card("ext-2", "Extraction", "What narrows an extraction run on a large repository?", "GenerateOptions, with subpath and maxFiles", "packages/extraction/src/workstream.ts"),
  card("sto-1", "Storage", "Which three files does a FlashLearn project keep?", "cards.json, review.json and settings.json", "packages/storage/src/paths.ts"),
  card("lrn-1", "Learning", "Which type lists the accepted review results?", "ReviewResult, in the shared contract", "contracts/index.d.ts"),
  card("lrn-2", "Learning", "Which field carries the date a card next comes due?", "nextReview on ReviewState", "packages/learning/src/workstream.ts"),
  card("fe-1", "Frontend", "How many cards does one review session take?", "SESSION_LIMIT, currently 12", "packages/frontend/client/src/lib/deck.ts"),
  card("fe-2", "Frontend", "Which endpoint does the client read its deck from?", "GET /api/cards", "contracts/http.md"),
];

/** The line each sample card was written from. Asserted to appear verbatim in
 *  the cited file, so an excerpt cannot drift into fiction. */
export const EXCERPTS: Record<string, { lines: string; code: string }> = {
  "cli-1": { lines: "src/production.ts", code: `import { createFlashLearnServer } from "@flashlearn/frontend";` },
  "cli-2": { lines: "src/paths.ts", code: `export function flashlearnRoot(input: string): string {` },
  "ext-1": { lines: "src/extractor.ts", code: `export const SOURCE_EXTENSIONS = new Set([".go", ".js", ".jsx", ".md", ".ts", ".tsx"]);` },
  "ext-2": { lines: "src/workstream.ts", code: `export type GenerateOptions = {` },
  "sto-1": { lines: "src/paths.ts", code: `return join(storeRoot(root), "cards.json");` },
  "lrn-1": { lines: "contracts/index.d.ts", code: `export type ReviewResult = "easy" | "hard" | "correct" | "incorrect";` },
  "lrn-2": { lines: "src/workstream.ts", code: `nextReview: nextReview.toISOString(),` },
  "fe-1": { lines: "lib/deck.ts", code: `export const SESSION_LIMIT = 12;` },
  "fe-2": { lines: "contracts/http.md", code: `| \`GET\` | \`/api/cards\` | \`Card[]\` |` },
};
