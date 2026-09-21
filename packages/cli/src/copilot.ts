import { execFile } from "node:child_process";

/** `--version` verifies that PATH resolves an executable, not just a stale path. */
export function detectCopilot(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("copilot", ["--version"], { timeout: 5_000 }, (error) => resolve(error === null));
  });
}
