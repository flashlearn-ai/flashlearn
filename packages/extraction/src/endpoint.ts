import type { GeneratedCard } from "../../../contracts/index.js";
import type { QuestionExtractor } from "./extractor.js";

type ExtractInput = { path: string; content: string; sha: string };

/** Code files go to the model; Markdown prose is already a usable answer. */
const CODE_EXTENSIONS = /\.(go|js|jsx|ts|tsx)$/i;

const MAX_CONTENT_CHARS = 24_000;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_CARDS = 5;

export type EndpointConfig = {
  /** Chat-completions URL, for example https://models.github.ai/inference/chat/completions. */
  url: string;
  model: string;
  apiKey?: string;
  /** Header carrying the key. Azure OpenAI uses `api-key`; most others use Authorization. */
  authHeader?: string;
  timeoutMs?: number;
  maxCardsPerFile?: number;
};

export const ENDPOINT_ENV = {
  url: "FLASHLEARN_ENDPOINT_URL",
  model: "FLASHLEARN_ENDPOINT_MODEL",
  apiKey: "FLASHLEARN_ENDPOINT_API_KEY",
  authHeader: "FLASHLEARN_ENDPOINT_AUTH_HEADER",
} as const;

/** Read endpoint settings from the environment, or null when not configured. */
export function endpointConfigFromEnv(env: NodeJS.ProcessEnv = process.env): EndpointConfig | null {
  const url = env[ENDPOINT_ENV.url]?.trim();
  const model = env[ENDPOINT_ENV.model]?.trim();
  if (!url || !model) return null;

  const apiKey = env[ENDPOINT_ENV.apiKey]?.trim();
  const authHeader = env[ENDPOINT_ENV.authHeader]?.trim();
  return {
    url,
    model,
    ...(apiKey ? { apiKey } : {}),
    ...(authHeader ? { authHeader } : {}),
  };
}

const SYSTEM_PROMPT = [
  "You write flashcards that help an engineer onboard to an unfamiliar codebase.",
  "Given one source file, produce questions a newcomer would genuinely ask and answers grounded only in the file.",
  "Prefer questions about behavior, control flow, and intent over restating names.",
  "Never invent APIs, file paths, or behavior that is not present in the file.",
  'Reply with JSON only: {"cards":[{"question":"...","answer":"..."}]}.',
  "Return an empty cards array when the file has nothing worth asking about.",
].join(" ");

function buildPrompt(input: ExtractInput, maxCards: number): string {
  const content =
    input.content.length > MAX_CONTENT_CHARS
      ? `${input.content.slice(0, MAX_CONTENT_CHARS)}\n… file truncated …`
      : input.content;
  return `File: ${input.path}\nWrite at most ${maxCards} cards.\n\n${content}`;
}

/** Pull the JSON object out of a reply that may be fenced or prose-wrapped. */
function parseCards(reply: string): { question: string; answer: string }[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply);
  const candidate = fenced?.[1]?.trim() ?? reply.trim();

  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return [];
  }

  const cards = (parsed as { cards?: unknown }).cards;
  if (!Array.isArray(cards)) return [];

  return cards.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { question, answer } = entry as { question?: unknown; answer?: unknown };
    if (typeof question !== "string" || typeof answer !== "string") return [];
    if (question.trim().length === 0 || answer.trim().length === 0) return [];
    return [{ question: question.trim(), answer: answer.trim() }];
  });
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Generates cards by asking a chat-completions endpoint about each code file.
 *
 * Attribution is stamped from the real path and SHA rather than the model
 * reply, so a hallucinated source cannot enter the card set. A file that fails
 * or times out yields no cards instead of aborting a repository-wide run.
 */
export class EndpointExtractor implements QuestionExtractor {
  private readonly config: EndpointConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: EndpointConfig, fetchImpl: FetchLike = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async extract(input: ExtractInput): Promise<GeneratedCard[]> {
    if (!CODE_EXTENSIONS.test(input.path)) return [];
    if (input.content.trim().length === 0) return [];

    const maxCards = this.config.maxCardsPerFile ?? DEFAULT_MAX_CARDS;
    const reply = await this.requestReply(buildPrompt(input, maxCards));
    if (reply === null) return [];

    return parseCards(reply)
      .slice(0, maxCards)
      .map((card) => ({
        question: card.question,
        answer: card.answer,
        source: { path: input.path, sha: input.sha },
      }));
  }

  /** Returns the assistant message, or null when the call fails for any reason. */
  private async requestReply(prompt: string): Promise<string | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await this.fetchImpl(this.config.url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: prompt },
          ],
          temperature: 0,
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const payload = (await response.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const content = payload.choices?.[0]?.message?.content;
      return typeof content === "string" ? content : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (!this.config.apiKey) return headers;

    const header = this.config.authHeader ?? "authorization";
    headers[header] =
      header.toLowerCase() === "authorization" ? `Bearer ${this.config.apiKey}` : this.config.apiKey;
    return headers;
  }
}
