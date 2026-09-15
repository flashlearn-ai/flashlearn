import type { Card } from "./lib/deck";

function card(id: string, topic: string, question: string, answer: string, path: string, sha: string): Card {
  return { id, question, answer, source: { path, sha }, tags: [topic], createdAt: "2026-09-14T15:42:00Z", updatedAt: "2026-09-14T15:42:00Z" };
}

export const DECK: Card[] = [
  card("cli-1", "CLI", "What command starts the local application?", "flashlearn start", "packages/cli/README.md", "8f5ed08"),
  card("cli-2", "CLI", "What command turns a directory into cards?", "flashlearn generate", "packages/cli/src/index.ts", "81ea830"),
  card("cli-3", "CLI", "Which package is the composition root?", "packages/cli", "packages/cli/README.md", "4ae779b"),
  card("cli-4", "CLI", "What does flashlearn init create?", "The .flashlearn state files", "packages/cli/src/init.ts", "8f5ed08"),
  card("sto-1", "Storage", "Where are generated cards persisted?", ".flashlearn/cards.json", "packages/storage/src/cards.ts", "4ae779b"),
  card("sto-2", "Storage", "What is the local persistence format?", "JSON", "packages/storage/README.md", "4ae779b"),
  card("sto-3", "Storage", "What is review.json keyed by?", "Card id", "packages/storage/src/review.ts", "81ea830"),
  card("lrn-1", "Learning", "What becomes due immediately after an incorrect review?", "The card", "packages/learning/src/schedule.ts", "81ea830"),
  card("lrn-2", "Learning", "What approach schedules reviews?", "Spaced repetition", "packages/learning/README.md", "4ae779b"),
  card("lrn-3", "Learning", "What does nextCard return when nothing is due?", "null", "packages/learning/src/select.ts", "8f5ed08"),
  card("ext-1", "Extraction", "What is the deterministic baseline extractor?", "AnnotationExtractor", "packages/extraction/src/annotation.ts", "81ea830"),
  card("ext-2", "Extraction", "What attribution does every card carry?", "path and sha", "packages/extraction/README.md", "4ae779b"),
];

/** Per-topic identity: a glyph, an accent, and a (mock) mastery count for the data micro-viz. */
export type TopicIcon = "terminal" | "database" | "repeat" | "file";
export const TOPIC_META: Record<string, { accent: string; icon: TopicIcon; mastered: number }> = {
  cli: { accent: "#12965a", icon: "terminal", mastered: 3 },
  storage: { accent: "#2f8fbf", icon: "database", mastered: 1 },
  learning: { accent: "#6a45c0", icon: "repeat", mastered: 0 },
  extraction: { accent: "#0f9d8f", icon: "file", mastered: 2 },
};

/** The exact source each card was generated from — the provenance "proof".
 *  In production this is the chunk extraction captured; here it's mock. */
export const EXCERPTS: Record<string, { lines: string; code: string }> = {
  "cli-1": { lines: "README.md · L12–15", code: "## Commands\n- `flashlearn start` — launches the local review UI\n- `flashlearn generate <dir>` — turn a directory into cards" },
  "cli-2": { lines: "src/index.ts · L20–22", code: "program\n  .command(\"generate <dir>\")\n  .description(\"turn a directory into cards\")" },
  "cli-3": { lines: "README.md · L3", code: "The CLI is the composition root; all other packages are isolated." },
  "cli-4": { lines: "src/init.ts · L8–10", code: "await writeState(\".flashlearn/cards.json\");\nawait writeState(\".flashlearn/review.json\");\nawait writeState(\".flashlearn/settings.json\");" },
  "sto-1": { lines: "src/cards.ts · L5", code: "const CARDS_PATH = \".flashlearn/cards.json\";" },
  "sto-2": { lines: "README.md · L1", code: "Storage is JSON on the local filesystem." },
  "sto-3": { lines: "src/review.ts · L11", code: "// review.json is an object keyed by card id\nconst review: Record<string, ReviewState> = {};" },
  "lrn-1": { lines: "src/schedule.ts · L18–20", code: "if (result === \"incorrect\") {\n  next.nextReview = now; // due immediately\n}" },
  "lrn-2": { lines: "README.md · L2", code: "FlashLearn uses spaced repetition to schedule reviews." },
  "lrn-3": { lines: "src/select.ts · L9", code: "if (due.length === 0) return null;" },
  "ext-1": { lines: "src/annotation.ts · L4", code: "export class AnnotationExtractor implements QuestionExtractor {" },
  "ext-2": { lines: "README.md · L6", code: "Every card source carries both `path` and `sha`." },
};
