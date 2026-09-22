import type { GenerationProgress } from "./dependencies.js";

export function generationProgress(write: (value: string) => void, tty: boolean) {
  let started: number | undefined;
  let last = 0;
  let phase = "";
  return (progress: GenerationProgress) => {
    const now = performance.now();
    started ??= now;
    if (progress.phase === phase && !progress.message && now - last < (tty ? 100 : 2_000)) return;
    last = now;
    phase = progress.phase;
    const ratio = progress.phase === "done" ? 1 : progress.total ? progress.completed / progress.total : 0;
    const filled = Math.floor(Math.min(1, ratio) * 20);
    const bar = `[${"=".repeat(filled)}${" ".repeat(20 - filled)}]`;
    const line = `${bar} ${progress.phase} ${progress.completed}/${progress.total || "?"} | ${progress.cards}/100 cards | ${((now - started) / 1000).toFixed(1)}s`;
    if (progress.message) write(`${tty ? "\r\u001b[2K" : ""}${progress.message}\n`);
    write(`${tty ? "\r\u001b[2K" : ""}${line}${!tty || progress.phase === "done" || progress.phase === "paused" ? "\n" : ""}`);
  };
}
