import { emitKeypressEvents } from "node:readline";
import { stripVTControlCharacters } from "node:util";
import type { ReviewResult } from "../../../contracts/index.js";
import type { FrontendServices } from "./dependencies.js";

export interface ReviewTerminal {
  write(text: string): void;
  readKey(): Promise<string | null>;
  close(): void;
}

const SESSION_LIMIT = 12;
const RATINGS: Record<string, ReviewResult> = { "1": "incorrect", "2": "hard", "3": "correct", "4": "easy" };

// Source text is displayed literally, never interpreted as terminal commands.
function display(text: string): string {
  return stripVTControlCharacters(text).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "");
}

export async function reviewInTerminal(services: FrontendServices, terminal: ReviewTerminal): Promise<void> {
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
    write("\nFLASHLEARN · TERMINAL REVIEW\nRecall the answer, reveal it, then rate yourself. Q quits at any prompt.\n");
    if (!(await services.listCards()).length) {
      throw new Error("No study cards found. Run flashlearn generate for this project first.");
    }
    while (saved < SESSION_LIMIT) {
      const card = await services.nextCard();
      if (!card) { write("\nAll caught up — no cards are due.\n"); break; }
      write(`\n── Review ${saved + 1}/${SESSION_LIMIT} ──\n${card.tags?.length ? `Topic: ${card.tags.join(", ")}\n` : ""}\n${card.question}\n\n[Enter/Space] Reveal answer   [Q] Quit\n`);
      if (await choose(["enter", " "]) === null) break;
      write(`\n${card.answer}\n\nSource: ${card.source.path} @ ${card.source.sha}\n\n[1] Incorrect  [2] Hard  [3] Correct  [4] Easy  [Q] Quit\n`);
      const rating = await choose(Object.keys(RATINGS));
      if (rating === null) break;
      write("Saving review…\n");
      // Advance only after persistence succeeds; scheduling remains learning-owned.
      const state = await services.submitReview(card.id, RATINGS[rating]!);
      saved += 1;
      write(`Saved: ${RATINGS[rating]}.${state.nextReview ? ` Next due: ${state.nextReview}.` : ""}\n`);
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
