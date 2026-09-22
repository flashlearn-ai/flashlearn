import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = resolve(process.argv[2] ?? ".");
const model = process.argv[3] ?? "auto";
const keep = process.argv.includes("--keep");
const root = await mkdtemp(join(tmpdir(), "flashlearn-bench-"));
const project = join(root, "repository");
try {
  const clone = spawnSync("git", ["clone", "--quiet", "--shared", source, project], { encoding: "utf8" });
  if (clone.status !== 0) throw new Error(clone.stderr);
  const started = performance.now();
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../dist/index.js", import.meta.url)),
    "generate", "--project", project, "--copilot-model", model], { encoding: "utf8", timeout: 2_880_000 });
  const elapsedMs = performance.now() - started;
  process.stderr.write(result.stderr ?? "");
  process.stdout.write(result.stdout ?? "");
  const cards = JSON.parse(await readFile(join(project, ".flashlearn/cards.json"), "utf8").catch(() => "[]"));
  const categories = {};
  for (const card of cards) categories[card.tags?.[0] ?? "untagged"] = (categories[card.tags?.[0] ?? "untagged"] ?? 0) + 1;
  console.log(JSON.stringify({ source, model, elapsedMs: Math.round(elapsedMs), cards: cards.length,
    codeCards: cards.filter((card) => !card.source.path.endsWith(".md")).length,
    documentationCards: cards.filter((card) => card.source.path.endsWith(".md")).length,
    categories,
    excludedSourceCards: cards.filter((card) => /(^|\/)(?:_LICENSES|\.agents|vendor|third_party)\//i.test(card.source.path)).length,
    ...(keep ? { evaluationDeck: join(project, ".flashlearn/cards.json") } : {}),
    exitCode: result.status, error: result.error?.message, underOneMinute: elapsedMs < 60_000 }, null, 2));
  process.exitCode = result.status === 0 && cards.length > 0 && cards.length <= 100
    && !categories.untagged && Object.values(categories).every((count) => count >= 5) ? 0 : 1;
} finally {
  if (!keep) await rm(root, { recursive: true, force: true });
}
