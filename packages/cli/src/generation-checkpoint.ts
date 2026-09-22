import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { endpointConfigFromEnv } from "@flashlearn/extraction";
import type { Candidate } from "./card-quality.js";
import type { GenerateOptions, StudyGeneratedCard } from "./dependencies.js";
import { flashlearnRoot } from "./paths.js";

export type GenerationCheckpoint = {
  version: 1;
  fingerprint: string;
  batches: Array<Candidate[] | null>;
  categorized?: StudyGeneratedCard[];
};

export function checkpointPath(root: string, options: GenerateOptions): string {
  const endpoint = endpointConfigFromEnv();
  const provider = options.provider ?? (endpoint ? { kind: "endpoint", ...endpoint } : { kind: "deterministic" });
  // Credentials never enter either the checkpoint or its identity. A corrected
  // API key can therefore resume successful work from the same provider/model.
  const identity = { subpath: options.subpath ?? "", maxFiles: options.maxFiles ?? null,
    kind: provider.kind, model: "model" in provider ? provider.model ?? "auto" : "auto",
    url: "url" in provider ? provider.url : undefined };
  const key = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
  return join(flashlearnRoot(root), "generation", `${key}.json`);
}

function isCard(value: unknown): value is Candidate {
  if (!value || typeof value !== "object") return false;
  const card = value as Candidate;
  return typeof card.question === "string" && typeof card.answer === "string"
    && typeof card.source?.path === "string" && typeof card.source?.sha === "string";
}

export async function loadCheckpoint(path: string, fingerprint: string, count: number): Promise<GenerationCheckpoint | null> {
  let raw: unknown;
  try { raw = JSON.parse(await readFile(path, "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new Error(`Cannot read generation checkpoint ${path}. Use generate --fresh to start over.`, { cause: error });
  }
  const value = raw as GenerationCheckpoint;
  if (!value || value.version !== 1 || typeof value.fingerprint !== "string" || !Array.isArray(value.batches)
    || !value.batches.every((batch) => batch === null || (Array.isArray(batch) && batch.every(isCard)))
    || (value.categorized !== undefined && (!Array.isArray(value.categorized) || !value.categorized.every((card) => isCard(card)
      && Array.isArray(card.tags) && card.tags.length === 1 && typeof card.tags[0] === "string")))) {
    throw new Error(`Invalid generation checkpoint ${path}. Use generate --fresh to start over.`);
  }
  return value.fingerprint === fingerprint && value.batches.length === count ? value : null;
}

/** Each snapshot is serialized before queueing, then atomically replaces the file. */
export function checkpointWriter(path: string) {
  let pending = Promise.resolve();
  return (state: GenerationCheckpoint) => {
    const json = JSON.stringify(state);
    pending = pending.then(async () => {
      await mkdir(dirname(path), { recursive: true });
      const temporary = `${path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, json, { mode: 0o600 });
        await rename(temporary, path);
      } finally { await rm(temporary, { force: true }); }
    });
    return pending;
  };
}

/** Only discard the checkpoint after all categorized cards have been persisted. */
export async function completeGeneration(root: string, options: GenerateOptions = {}): Promise<void> {
  // Offline runs do not consume AI checkpoints.
  if (options.provider?.kind === "deterministic") return;
  await rm(checkpointPath(root, options), { force: true });
}
