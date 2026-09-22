import type { CliIO } from "./cli.js";
import type { GenerateOptions, GenerationProvider } from "./dependencies.js";

/** One explicit source-selection stage shared by generate and empty-deck start. */
export async function selectInferenceSource(io: CliIO, options: GenerateOptions = {}): Promise<GenerateOptions> {
  io.stderr("\nINFERENCE SOURCE\n  Choose how FlashLearn generates questions and learning categories.");
  const explicit = options.inferenceSource ?? (options.provider?.kind === "copilot" ? "copilot" : undefined);
  if (!explicit && io.endpointConfigured) {
    io.stderr("  Selected: configured inference endpoint (FLASHLEARN_ENDPOINT_*).\n  Override with --inference-source to choose a different source.");
    return options;
  }
  const available = !explicit || explicit === "copilot" ? await io.detectCopilot?.() ?? false : false;
  let choice = explicit;
  if (!choice) {
    io.stderr(`  copilot   GitHub Copilot CLI — ${available ? "detected on PATH (default; sends code/docs to Copilot)" : "not found on PATH"}\n  openai    OpenAI API — API key + model\n  claude    Anthropic Messages API — API key + model\n  custom    OpenAI-compatible URL — model + optional key/header\n  heuristic Offline source-derived recall — no LLM or network`);
    const input = await io.prompt?.(`Inference source [copilot/openai/claude/custom/heuristic] (default ${available ? "copilot" : "heuristic"}): `);
    // null/undefined means no interactive answer; only an actual Enter accepts
    // the displayed default. Detection alone must not enable AI in automation.
    if (input == null) return offline(io, options, "No interactive AI selection.");
    const answer = input.trim().toLowerCase() || (available ? "copilot" : "heuristic");
    if (answer === "deterministic") choice = "heuristic";
    else if (["copilot", "openai", "claude", "custom", "heuristic"].includes(answer)) choice = answer as NonNullable<GenerateOptions["inferenceSource"]>;
    else throw new Error(`Unknown inference source: ${answer}. Choose copilot, openai, claude, custom, or heuristic.`);
  }
  if (choice === "heuristic") return offline(io, options, "Offline heuristic selected.");
  if (choice === "copilot") {
    if (!available) throw new Error("Copilot CLI is unavailable on PATH. Install/authenticate Copilot or choose --inference-source heuristic.");
    const model = options.copilotModel ?? "auto";
    io.stderr(`  Using GitHub Copilot CLI (model: ${model}). Code and docs are sent to Copilot.\n  Authentication: your existing Copilot login.`);
    return { ...options, provider: { kind: "copilot", model } };
  }
  if (!io.prompt) throw new Error("Interactive provider setup is unavailable. Configure FLASHLEARN_ENDPOINT_* or choose --inference-source heuristic.");
  io.stderr("  Selected AI receives code/documentation excerpts. API keys are hidden and used for this command only.");
  let provider: Extract<GenerationProvider, { kind: "endpoint" | "anthropic" }> | undefined;
  const ask = async (message: string, fallback?: string, secret = false) => {
    const value = await io.prompt!(message, secret);
    return value == null ? undefined : value.trim() || fallback;
  };
  if (choice === "openai" || choice === "claude") {
    const apiKey = await ask(`${choice === "openai" ? "OpenAI" : "Anthropic"} API key (current run only; blank cancels): `, undefined, true);
    if (!apiKey) return offline(io, options, "Provider setup was incomplete.");
    const model = await ask(choice === "openai" ? "OpenAI model [gpt-4o-mini]: " : "Claude model [claude-sonnet-4-5]: ", choice === "openai" ? "gpt-4o-mini" : "claude-sonnet-4-5");
    if (model) provider = choice === "openai" ? { kind: "endpoint", url: "https://api.openai.com/v1/chat/completions", model, apiKey }
      : { kind: "anthropic", model, apiKey };
  } else {
    const url = await ask("Full OpenAI-compatible chat-completions URL: ");
    if (!url) return offline(io, options, "Provider setup was incomplete.");
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error("Custom inference URL must be an absolute http:// or https:// URL."); }
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Custom inference URL must use HTTP(S) without embedded credentials; enter credentials in the key prompt.");
    const model = await ask("Model or deployment name: ");
    if (!model) return offline(io, options, "Provider setup was incomplete.");
    const keyInput = await io.prompt("API key (optional; current run only): ", true);
    if (keyInput === null) return offline(io, options, "Provider setup was cancelled.");
    const apiKey = keyInput.trim();
    const authHeader = apiKey ? await ask("Authentication header [Authorization]: ", "Authorization") : undefined;
    if (apiKey && !authHeader) return offline(io, options, "Provider setup was cancelled.");
    if (authHeader && !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(authHeader)) throw new Error("Authentication header must be a valid HTTP header name.");
    provider = { kind: "endpoint", url, model, ...(apiKey ? { apiKey, authHeader } : {}) };
  }
  if (!provider) return offline(io, options, "Provider setup was incomplete.");
  io.stderr(`  Selected: ${choice} / model: ${provider.model}\n  API key will not be saved. Selection applies to this command only.`);
  return { ...options, provider };
}

function offline(io: CliIO, options: GenerateOptions, reason: string): GenerateOptions {
  io.stderr(`  ${reason} Falling back to deterministic generation (offline heuristic).\n  No source code will be sent to an AI provider.\n  Extractive recall only: no inferred architecture or LLM categories; fewer cards are expected.`);
  return { ...options, provider: { kind: "deterministic" } };
}
