import type { GenerationProgress } from "./dependencies.js";

const STAGES: Record<GenerationProgress["phase"], string> = {
  scanning: "1/6  Scan repository", selecting: "2/6  Select learning sources",
  generating: "3/6  Generate candidates", reviewing: "4/6  Review card quality",
  categorizing: "5/6  Organize learning categories", saving: "6/6  Save study deck",
  done: "COMPLETE", paused: "STOPPED — see error and recovery instructions below",
};

export function duration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

// Strip terminal control characters from provider/model/path diagnostics.
function plain(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

export function generationProgress(write: (value: string) => void, tty: boolean,
  clock = Date.now, columns = () => process.stderr.columns || 100) {
  let started: number | undefined;
  let phaseStarted = 0;
  let last = 0;
  let phase = "";
  let openLine = false;
  const clear = () => { if (openLine) { write("\r\u001b[2K"); openLine = false; } };
  return (progress: GenerationProgress) => {
    const now = clock();
    if (started === undefined || (progress.phase === "scanning" && ["done", "paused"].includes(phase))) started = now;
    const changed = phase !== progress.phase;
    if (changed) {
      clear();
      phaseStarted = now;
      phase = progress.phase;
      write(`\n  ${STAGES[progress.phase]}\n`);
    }
    if (!changed && !progress.message && now - last < (tty ? 250 : 10_000)) return;
    last = now;
    if (progress.message) {
      clear();
      write(plain(progress.message).split(/\r?\n/).map((line) => `    ${line}`).join("\n") + "\n");
    }
    const elapsed = `elapsed ${duration(now - started)}`;
    let status: string;
    if (progress.phase === "done") status = `${progress.cards} cards saved | ${elapsed}`;
    else if (progress.phase === "paused") status = `${progress.cards} cards/candidates reached | ${elapsed}`;
    else if (progress.phase === "scanning") status = `Discovering supported files and Git attribution | ${elapsed}`;
    else if (progress.phase === "categorizing" && progress.completed < progress.total) {
      status = `Waiting for model response | ${progress.cards} cards | attempt ${progress.attempt ?? 1}/2 | ${elapsed}`;
    } else {
      const unit = progress.unit ?? (progress.phase === "generating" ? "batches" : "cards");
      const ratio = progress.total ? Math.max(0, Math.min(1, progress.completed / progress.total)) : 0;
      const filled = Math.floor(ratio * 16);
      status = `[${"=".repeat(filled)}${" ".repeat(16 - filled)}] ${progress.completed}/${progress.total} ${unit}`;
      if (progress.phase === "generating" && unit === "batches") status += ` | ${progress.active ?? 0} active | ${progress.failed ?? 0} failed | ${progress.resumed ?? 0} reused`;
      status += ` | ${progress.cards} ${progress.phase === "generating" ? "candidates" : "cards"} | ${elapsed}`;
    }
    if (progress.requestStartedAt !== undefined && progress.timeoutMs !== undefined) {
      const requestAge = Math.max(0, now - progress.requestStartedAt);
      status += ` | request ${duration(requestAge)}, limit in ${duration(progress.timeoutMs - requestAge)}`;
    } else if (!["done", "paused"].includes(progress.phase)) status += ` | stage ${duration(now - phaseStarted)}`;
    // Events remain full-width permanent lines; only the live status is clipped
    // to avoid wrapping and leaving orphaned progress bars in narrow terminals.
    const line = `    ${status}`;
    if (tty && !["done", "paused"].includes(progress.phase)) {
      clear();
      const width = Math.max(16, columns() - 1);
      write(line.length > width ? line.slice(0, width - 3) + "..." : line);
      openLine = true;
    } else {
      clear();
      write(`${line}\n`);
    }
  };
}
