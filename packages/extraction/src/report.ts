import { extname } from "node:path";
import type { GeneratedCard } from "../../../contracts/index.js";

export type ExtensionBreakdown = {
  extension: string;
  cards: number;
  files: number;
};

export type CorpusReport = {
  cards: number;
  files: number;
  byExtension: ExtensionBreakdown[];
  topFiles: { path: string; cards: number }[];
  answerLength: { min: number; median: number; max: number; mean: number };
  duplicateQuestions: number;
};

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return Math.round(((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2);
}

/**
 * Summarize generated cards so extraction changes can be compared against a
 * real repository instead of hand-written fixtures.
 */
export function summarizeCards(cards: GeneratedCard[]): CorpusReport {
  const perFile = new Map<string, number>();
  const perExtension = new Map<string, { cards: number; files: Set<string> }>();
  const questionCounts = new Map<string, number>();
  const lengths: number[] = [];

  for (const card of cards) {
    const path = card.source.path;
    perFile.set(path, (perFile.get(path) ?? 0) + 1);

    const extension = extname(path).toLowerCase() || "(none)";
    const bucket = perExtension.get(extension) ?? { cards: 0, files: new Set<string>() };
    bucket.cards += 1;
    bucket.files.add(path);
    perExtension.set(extension, bucket);

    const key = `${path}::${card.question}`;
    questionCounts.set(key, (questionCounts.get(key) ?? 0) + 1);

    lengths.push(card.answer.length);
  }

  lengths.sort((a, b) => a - b);
  const total = lengths.reduce((sum, length) => sum + length, 0);

  return {
    cards: cards.length,
    files: perFile.size,
    byExtension: [...perExtension.entries()]
      .map(([extension, bucket]) => ({ extension, cards: bucket.cards, files: bucket.files.size }))
      .sort((a, b) => b.cards - a.cards || a.extension.localeCompare(b.extension)),
    topFiles: [...perFile.entries()]
      .map(([path, count]) => ({ path, cards: count }))
      .sort((a, b) => b.cards - a.cards || a.path.localeCompare(b.path))
      .slice(0, 10),
    answerLength: {
      min: lengths[0] ?? 0,
      median: median(lengths),
      max: lengths[lengths.length - 1] ?? 0,
      mean: lengths.length > 0 ? Math.round(total / lengths.length) : 0,
    },
    duplicateQuestions: [...questionCounts.values()].filter((count) => count > 1).length,
  };
}

/** Render a report as plain text for terminal output. */
export function formatReport(report: CorpusReport): string {
  const lines = [
    `Cards: ${report.cards}`,
    `Files with cards: ${report.files}`,
    "",
    "By extension:",
    ...report.byExtension.map(
      (row) => `  ${row.extension.padEnd(8)} ${String(row.cards).padStart(6)} cards  ${String(row.files).padStart(5)} files`,
    ),
    "",
    "Answer length:",
    `  min ${report.answerLength.min}  median ${report.answerLength.median}  mean ${report.answerLength.mean}  max ${report.answerLength.max}`,
    "",
    "Top files:",
    ...report.topFiles.map((row) => `  ${String(row.cards).padStart(4)}  ${row.path}`),
  ];

  if (report.duplicateQuestions > 0) {
    lines.push("", `Duplicate questions within a file: ${report.duplicateQuestions}`);
  }

  return lines.join("\n");
}
