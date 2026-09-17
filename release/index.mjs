#!/usr/bin/env node
import { readFileSync } from "node:fs";

// CLI-only public entrypoint. Workspace development versions stay private.
const args = process.argv.slice(2);
if (args.length === 1 && ["--version", "-v"].includes(args[0])) {
  console.log(JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version);
} else {
  await import("../packages/cli/src/index.ts");
}
