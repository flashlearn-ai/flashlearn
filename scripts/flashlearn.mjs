#!/usr/bin/env node
import { ensureCliBuilds } from "./ensure-cli-builds.mjs";

try {
  await ensureCliBuilds({ packages: ["extraction", "frontend", "learning", "storage", "cli"] });
  await import("../packages/cli/dist/index.js");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to start FlashLearn");
  process.exitCode = 1;
}
