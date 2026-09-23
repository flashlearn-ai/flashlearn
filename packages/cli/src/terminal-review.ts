import { emitKeypressEvents } from "node:readline";
import { stripVTControlCharacters } from "node:util";
import type { Card, ReviewResult } from "../../../contracts/index.js";
import type { FrontendServices } from "./dependencies.js";

export interface ReviewTerminal {
  write(text: string): void;
  readKey(): Promise<string | null>;
  close(): void;
}

const SESSION_LIMIT = 12;

// Source text is displayed literally, never interpreted as terminal commands.
function display(text: string): string {
  return stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

type AnswerChoice = { text: string; correct: boolean };

function shuffle<T>(items: T[], random: () => number): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

/** Use real deck answers, preferring related topics; never invent distractors. */
export function terminalChoices(card: Card, pool: Card[], random: () => number = Math.random): AnswerChoice[] {
  const key = (text: string) => display(text).normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  const correct = display(card.answer).trim();
  if (!key(correct)) return [];
  const seen = new Set([key(correct)]);
  const related = (other: Card) => other.source.path === card.source.path || Boolean(other.tags?.some((tag) => card.tags?.includes(tag)));
  const candidates = shuffle(pool.filter((other) => other.id !== card.id), random)
    .sort((a, b) => Number(related(b)) - Number(related(a)));
  const choices: AnswerChoice[] = [{ text: correct, correct: true }];
  for (const other of candidates) {
    const text = display(other.answer).trim();
    const normalized = key(text);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    choices.push({ text, correct: false });
    if (choices.length === 4) break;
  }
  return shuffle(choices, random);
}

export async function reviewInTerminal(services: FrontendServices, terminal: ReviewTerminal, random: () => number = Math.random): Promise<void> {
  let saved = 0;
  const write = (text: string) => terminal.write(display(text));
  const choose = async (allowed: string[]): Promise<string | null> => {
    while (true) {
      const key = await terminal.readKey();
      if (key === null || key === "q") return null;
      if (allowed.includes(key)) return key;
    }
  };
  try {
    write("\nFLASHLEARN · MULTIPLE-CHOICE REVIEW\nChoose the best answer by number. Results are saved automatically. Q quits at any prompt.\n");
    const pool = await services.listCards();
    if (!pool.length) {
      throw new Error("No study cards found. Run flashlearn generate for this project first.");
    }
    while (saved < SESSION_LIMIT) {
      const card = await services.nextCard();
      if (!card) { write("\nAll caught up — no cards are due.\n"); break; }
      const choices = terminalChoices(card, pool, random);
      if (choices.length < 2) {
        write("\nMultiple choice needs at least two distinct, nonempty answers. Generate more cards for this project, then review again.\n");
        break;
      }
      write(`\n── Review ${saved + 1}/${SESSION_LIMIT} ──\n${card.tags?.length ? `Topic: ${card.tags.join(", ")}\n` : ""}\n${card.question}\n\n${choices.map((choice, index) => `[${index + 1}] ${choice.text}`).join("\n\n")}\n\nChoose [1–${choices.length}]   [Q] Quit\n`);
      const selected = await choose(choices.map((_, index) => String(index + 1)));
      if (selected === null) break;
      const result: ReviewResult = choices[Number(selected) - 1]!.correct ? "correct" : "incorrect";
      const answerNumber = choices.findIndex((choice) => choice.correct) + 1;
      write(`\n${result === "correct" ? "Correct!" : "Incorrect."} Answer [${answerNumber}]: ${card.answer}\n\nSource: ${card.source.path} @ ${card.source.sha}\n`);
      write("Saving review…\n");
      // Advance only after persistence succeeds; scheduling remains learning-owned.
      const state = await services.submitReview(card.id, result);
      saved += 1;
      write(`Saved: ${result}.${state.nextReview ? ` Next due: ${state.nextReview}.` : ""}\n`);
      if (saved < SESSION_LIMIT) {
        write("[Enter/Space] Next due card   [Q] Quit\n");
        if (await choose(["enter", " "]) === null) break;
      }
    }
  } finally {
    try {
      write(`\nSession ended: ${saved} review${saved === 1 ? "" : "s"} saved.\n`);
    } finally {
      terminal.close();
    }
  }
}

/** Scrollback-friendly keyboard TUI; no browser, server, or terminal dependency. */
export function openReviewTerminal(): ReviewTerminal {
  const input = process.stdin;
  const output = process.stderr;
  if (!input.isTTY || !output.isTTY) throw new Error("Terminal review requires an interactive terminal. Use question list for noninteractive output.");
  const wasRaw = input.isRaw;
  let ended = false;
  let pending: ((key: string | null) => void) | undefined;
  const deliver = (key: string | null) => { const resolve = pending; pending = undefined; resolve?.(key); };
  const onEnd = () => { ended = true; deliver(null); };
  const onKey = (text: string | undefined, key: { name?: string; ctrl?: boolean; meta?: boolean }) => {
    if (key.ctrl && (key.name === "c" || key.name === "d")) { onEnd(); return; }
    if (key.ctrl || key.meta) return;
    deliver(key.name === "return" ? "enter" : (text ?? "").toLowerCase());
  };
  emitKeypressEvents(input);
  input.setRawMode(true);
  input.on("keypress", onKey);
  input.on("end", onEnd);
  input.on("close", onEnd);
  input.resume();
  return {
    write: (text) => { output.write(text); },
    readKey: () => ended ? Promise.resolve(null) : new Promise((resolve) => { pending = resolve; }),
    close: () => {
      onEnd();
      input.off("keypress", onKey);
      input.off("end", onEnd);
      input.off("close", onEnd);
      input.setRawMode(wasRaw);
      input.pause();
    },
  };
}
