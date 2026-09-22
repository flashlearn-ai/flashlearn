import { deterministicExtractor, endpointConfigFromEnv, ExtractionService, type SourceDocument } from "@flashlearn/extraction";
import type { GeneratedCard } from "../../../contracts/index.js";
import { MAX_GENERATED_CARDS, type GenerateOptions, type StudyGeneratedCard } from "./dependencies.js";
import { categorizeCards } from "./categories.js";
import { copilotBatch, inferenceRunner, type runCopilot } from "./providers.js";
import { classifySources, isDocumentation, selectBatches, sourceExcerpt, subsystem } from "./source-selection.js";
import { selectCards, type Candidate } from "./card-quality.js";
import { createHash } from "node:crypto";
import { checkpointPath, loadCheckpoint, checkpointWriter, type GenerationCheckpoint } from "./generation-checkpoint.js";
import { INFERENCE_TIMEOUT_MS } from "./providers.js";

/** Source traversal/attribution remain owned by extraction; CLI plans bounded inference. */
export async function generateBounded(root: string, options: GenerateOptions = {}, run?: typeof runCopilot): Promise<StudyGeneratedCard[]> {
  const { onProgress } = options;
  onProgress?.({ phase: "scanning", completed: 0, total: 0, cards: 0 });
  // Apply maxFiles after relevance/importance selection, so dependency docs cannot
  // consume the file budget before the README. subpath still strictly scopes IO.
  const documents = await new ExtractionService().scanRepository(root, { subpath: options.subpath });
  const classification = classifySources(documents);
  const ranked = classification.ranked.slice(0, options.maxFiles);
  onProgress?.({ phase: "selecting", completed: documents.length, total: documents.length, cards: 0,
    message: `Classified ${documents.length} files: ${classification.excluded} excluded; ${ranked.length} eligible within the file budget. README: ${ranked.includes(classification.readme!) ? classification.readme!.path : "none in scope"}.` });
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
  if (previous) onProgress?.({ phase: "generating", completed, total: batches.length, cards: accepted,
    message: `Resuming checkpoint: ${completed}/${batches.length} completed batches, ${accepted} candidates retained${state.categorized ? "; categories already complete" : ""}.` });
  if (state.categorized) return state.categorized;
  onProgress?.({ phase: "generating", completed, total: batches.length, cards: Math.min(accepted, MAX_GENERATED_CARDS),
    message: `${provider.kind} ${provider.model ?? "auto"}: ${batches.flat().length} important files (${batches.flat().filter(isDocumentation).length} docs), ${batches.length} parallel batches. No filler cards.` });
  const settled = await Promise.allSettled(batches.map(async (batch, index) => {
    if (state.batches[index] !== null) return;
    const focus = batch.every(isDocumentation) ? "architecture, vocabulary, component relationships and end-to-end lifecycle; distinguish documented design from implementation" : `${subsystem(batch[0]!.path)}: mechanisms, interactions and failure behavior`;
    let candidates: Candidate[];
    try { candidates = await copilotBatch(batch, provider.model ?? "auto", INFERENCE_TIMEOUT_MS, runner, context, focus); }
    catch (error) {
      onProgress?.({ phase: "generating", completed, total: batches.length, cards: Math.min(accepted, MAX_GENERATED_CARDS),
        message: `Batch ${index + 1} failed: ${error instanceof Error ? error.message : "inference failed"}. Completed batches remain checkpointed.` });
      throw error;
    }
    state.batches[index] = candidates;
    await save(state);
    completed++;
    accepted += candidates.length;
    onProgress?.({ phase: "generating", completed, total: batches.length, cards: Math.min(accepted, MAX_GENERATED_CARDS) });
  }));
  const failures = settled.filter((result) => result.status === "rejected");
  if (failures.length) throw new Error(`${failures.length} batch(es) failed; ${completed}/${batches.length} completed batches (${accepted} candidates) retained at ${path}. Repeat the same command/provider to resume only unfinished work. ${String((failures[0] as PromiseRejectedResult).reason)}`);
  const results = state.batches.map((batch) => batch ?? []);
  const selected = selectCards(results.flat(), MAX_GENERATED_CARDS);
  onProgress?.({ phase: "generating", completed, total: batches.length, cards: selected.cards.length,
    message: `${selected.cards.length} grounded AI cards selected; ${selected.rejected} candidates removed by quality, redundancy, diversity or cap checks. ${results.filter((batch) => !batch.length).length} batches yielded no evidence-backed cards (empty, failure, timeout or invalid output). No deterministic filler.` });
  if (!selected.cards.length) return [];
  onProgress?.({ phase: "categorizing", completed: 0, total: selected.cards.length, cards: selected.cards.length,
    message: "Asking AI to organize learning categories (minimum five cards each)..." });
  let categorized: StudyGeneratedCard[];
  try { categorized = await categorizeCards(selected.cards, runner, provider.model ?? "auto"); }
  catch (error) {
    throw new Error(`${error instanceof Error ? error.message : "Category generation failed"} ${selected.cards.length} selected cards retained at ${path}. Repeat the same command/provider to retry categorization without regenerating completed batches.`);
  }
  state.categorized = categorized;
  await save(state);
  const counts = new Map<string, number>();
  for (const card of categorized) counts.set(card.tags![0]!, (counts.get(card.tags![0]!) ?? 0) + 1);
  onProgress?.({ phase: "categorizing", completed: categorized.length, total: categorized.length, cards: categorized.length,
    message: `Learning categories: ${[...counts].map(([name, count]) => `${name} (${count})`).join("; ")}` });
  return categorized;
}

async function deterministicCards(documents: SourceDocument[], options: GenerateOptions): Promise<GeneratedCard[]> {
  const extractor = deterministicExtractor();
  const candidates: Candidate[] = [];
  let completed = 0;
  for (let i = 0; i < Math.min(documents.length, 80); i += 8) {
    const wave = documents.slice(i, Math.min(i + 8, 80));
    candidates.push(...(await Promise.all(wave.map((document) => extractor.extract(document)))).flat());
    completed += wave.length;
    options.onProgress?.({ phase: "generating", completed, total: Math.min(documents.length, 80), cards: selectCards(candidates).cards.length });
  }
  // Deterministic doc questions remain section recall, clearly labeled as such.
  // Avoid vague headings and incomplete answers rather than inventing meaning.
  for (const card of candidates) {
    const heading = /^What does "(.+)" cover\?$/.exec(card.question)?.[1];
    if (heading) card.question = `According to ${card.source.path}, what is explained about ${heading}?`;
  }
  const selected = selectCards(candidates);
  options.onProgress?.({ phase: "generating", completed, total: Math.min(documents.length, 80), cards: selected.cards.length,
    message: `Deterministic section/doc-comment recall: ${selected.cards.length} cards; ${selected.rejected} rejected. AI synthesis is disabled.` });
  return selected.cards;
}
