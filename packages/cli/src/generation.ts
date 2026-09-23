import { endpointConfigFromEnv, ExtractionService, type SourceDocument } from "@flashlearn/extraction";
import type { GeneratedCard } from "../../../contracts/index.js";
import { MAX_GENERATED_CARDS, type GenerateOptions, type StudyGeneratedCard } from "./dependencies.js";
import { categorizeCards } from "./categories.js";
import { copilotBatch, inferenceRunner, type runCopilot } from "./providers.js";
import { classifySources, isDocumentation, selectBatches, sourceExcerpt, subsystem } from "./source-selection.js";
import { selectCards, type Candidate } from "./card-quality.js";
import { createHash } from "node:crypto";
import { checkpointPath, loadCheckpoint, checkpointWriter, type GenerationCheckpoint } from "./generation-checkpoint.js";
import { INFERENCE_TIMEOUT_MS } from "./providers.js";
import { duration } from "./progress.js";
import { heuristicCards } from "./heuristic.js";

/** Source traversal/attribution remain owned by extraction; CLI plans bounded inference. */
export async function generateBounded(root: string, options: GenerateOptions = {}, run?: typeof runCopilot): Promise<StudyGeneratedCard[]> {
  const { onProgress } = options;
  onProgress?.({ phase: "scanning", completed: 0, total: 0, cards: 0,
    message: `Scope: ${options.subpath ?? "whole repository"}\nFile budget: ${options.maxFiles ?? "automatic importance selection"}` });
  // Apply maxFiles after relevance/importance selection, so dependency docs cannot
  // consume the file budget before the README. subpath still strictly scopes IO.
  const documents = await new ExtractionService().scanRepository(root, { subpath: options.subpath });
  const classification = classifySources(documents);
  const ranked = classification.ranked.slice(0, options.maxFiles);
  onProgress?.({ phase: "selecting", completed: documents.length, total: documents.length, cards: 0, unit: "files",
    message: `Sources: ${documents.length} scanned / ${classification.excluded} excluded / ${ranked.length} eligible\nREADME: ${ranked.includes(classification.readme!) ? classification.readme!.path : "none in scope"}` });
  const config = endpointConfigFromEnv();
  const provider = options.provider ?? (config ? { kind: "endpoint" as const, ...config } : { kind: "deterministic" as const });
  if (provider.kind === "deterministic") return deterministicCards(ranked, options);

  const batches = selectBatches(ranked);
  const context = classification.readme && ranked.includes(classification.readme) ? sourceExcerpt(classification.readme, 5000) : "No README in the selected scope.";
  const runner = run ?? inferenceRunner(provider);
  const path = checkpointPath(root, options);
  // Hash actual working-tree content, not only Git's HEAD blob attribution.
  const fingerprint = createHash("sha256").update(JSON.stringify({ revision: 1, batches, context })).digest("hex");
  const previous = options.fresh ? null : await loadCheckpoint(path, fingerprint, batches.length);
  const state: GenerationCheckpoint = previous ?? { version: 1, fingerprint, batches: batches.map(() => null) };
  const save = checkpointWriter(path);
  await save(state);
  let completed = state.batches.filter((batch) => batch !== null).length;
  let accepted = state.batches.flatMap((batch) => batch ?? []).length;
  const resumed = completed;
  let failed = 0;
  const running = new Map<number, number>();
  const report = (message?: string) => onProgress?.({ phase: "generating", unit: "batches", completed, total: batches.length,
    cards: accepted, active: running.size, failed, resumed, message,
    ...(running.size ? { requestStartedAt: Math.min(...running.values()), timeoutMs: INFERENCE_TIMEOUT_MS } : {}) });
  report(`Provider: ${provider.kind} / model: ${provider.model ?? "auto"}\nPlan: ${batches.flat().length} files (${batches.flat().filter(isDocumentation).length} docs), ${batches.length} parallel batches\nPer-call timeout: ${duration(INFERENCE_TIMEOUT_MS)}\nCheckpoint: ${path}`);
  if (previous) report(`Resuming checkpoint: ${completed}/${batches.length} completed batches, ${accepted} candidates retained${state.categorized ? "; categories already complete" : ""}.`);
  if (state.categorized) {
    report(`Reusing ${state.categorized.length} categorized cards; no model calls needed. Continuing persistence.`);
    return state.categorized;
  }
  const settled = await Promise.allSettled(batches.map(async (batch, index) => {
    if (state.batches[index] !== null) return;
    const startedAt = Date.now();
    running.set(index, startedAt);
    report(`Batch ${index + 1}/${batches.length} started — ${batch.map((doc) => doc.path).join(", ")}`);
    const focus = batch.every(isDocumentation) ? "architecture, vocabulary, component relationships and end-to-end lifecycle; distinguish documented design from implementation" : `${subsystem(batch[0]!.path)}: mechanisms, interactions and failure behavior`;
    let candidates: Candidate[];
    try { candidates = await copilotBatch(batch, provider.model ?? "auto", INFERENCE_TIMEOUT_MS, runner, context, focus); }
    catch (error) {
      running.delete(index);
      failed++;
      report(`Batch ${index + 1}/${batches.length} FAILED after ${duration(Date.now() - startedAt)}: ${error instanceof Error ? error.message : "inference failed"}\nCompleted batches remain checkpointed. Other active batches will finish.`);
      throw error;
    }
    state.batches[index] = candidates;
    try { await save(state); }
    catch (error) {
      running.delete(index);
      failed++;
      report(`Batch ${index + 1}/${batches.length} checkpoint write FAILED; unable to confirm this batch is retained.`);
      throw error;
    }
    running.delete(index);
    completed++;
    accepted += candidates.length;
    report(`Batch ${index + 1}/${batches.length} saved to checkpoint — ${candidates.length} evidence-backed candidates in ${duration(Date.now() - startedAt)}`);
  }));
  const failures = settled.filter((result) => result.status === "rejected");
  if (failures.length) throw new Error(`${failures.length} batch(es) failed; ${completed}/${batches.length} completed batches (${accepted} candidates) retained at ${path}. Repeat the same command/provider to resume only unfinished work. ${String((failures[0] as PromiseRejectedResult).reason)}`);
  const results = state.batches.map((batch) => batch ?? []);
  onProgress?.({ phase: "reviewing", unit: "cards", completed: 0, total: accepted, cards: accepted });
  const selected = selectCards(results.flat(), MAX_GENERATED_CARDS);
  onProgress?.({ phase: "reviewing", unit: "cards", completed: accepted, total: accepted, cards: selected.cards.length,
    message: `Quality review: ${accepted} candidates → ${selected.cards.length} selected\nRemoved: ${selected.rejected} (quality, redundancy, diversity or cap checks)\nEmpty batches: ${results.filter((batch) => !batch.length).length}. No filler cards added.` });
  if (!selected.cards.length) return [];
  let categorized: StudyGeneratedCard[];
  try {
    categorized = await categorizeCards(selected.cards, runner, provider.model ?? "auto", INFERENCE_TIMEOUT_MS, (attempt, reason) => {
      onProgress?.({ phase: "categorizing", completed: 0, total: selected.cards.length, cards: selected.cards.length,
        attempt, requestStartedAt: Date.now(), timeoutMs: INFERENCE_TIMEOUT_MS,
        message: `${reason ? `Repair needed: ${reason}\n` : ""}Category request ${attempt}/2: organizing ${selected.cards.length} retained cards\nMinimum: 5 cards per category | Timeout: ${duration(INFERENCE_TIMEOUT_MS)}\nWaiting for a complete model response; saved candidates are retained.` });
    });
  }
  catch (error) {
    throw new Error(`${error instanceof Error ? error.message : "Category generation failed"} ${selected.cards.length} selected cards retained at ${path}. Repeat the same command/provider to retry categorization without regenerating completed batches.`);
  }
  state.categorized = categorized;
  await save(state);
  const counts = new Map<string, number>();
  for (const card of categorized) counts.set(card.tags![0]!, (counts.get(card.tags![0]!) ?? 0) + 1);
  onProgress?.({ phase: "categorizing", completed: categorized.length, total: categorized.length, cards: categorized.length,
    message: `Categories validated and checkpointed:\n${[...counts].map(([name, count]) => `- ${name}: ${count} cards`).join("\n")}` });
  return categorized;
}

async function deterministicCards(documents: SourceDocument[], options: GenerateOptions): Promise<GeneratedCard[]> {
  const candidates: Candidate[] = [];
  let completed = 0;
  for (let i = 0; i < Math.min(documents.length, 80); i += 8) {
    const wave = documents.slice(i, Math.min(i + 8, 80));
    candidates.push(...wave.flatMap(heuristicCards));
    completed += wave.length;
    options.onProgress?.({ phase: "generating", unit: "files", completed, total: Math.min(documents.length, 80), cards: selectCards(candidates).cards.length });
  }
  const selected = selectCards(candidates);
  options.onProgress?.({ phase: "reviewing", unit: "cards", completed: candidates.length, total: candidates.length, cards: selected.cards.length,
    message: `Offline heuristic: ${selected.cards.length} extractive cards; ${selected.rejected} rejected. Complete definitions and explanatory prose only; no LLM synthesis or categories.` });
  return selected.cards;
}
