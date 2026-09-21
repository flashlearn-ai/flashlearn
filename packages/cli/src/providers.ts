import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GeneratedCard } from "../../../contracts/index.js";
import type { FetchLike, QuestionExtractor } from "@flashlearn/extraction";

const execFileAsync = promisify(execFile);
const CODE_EXTENSIONS = /\.(go|js|jsx|ts|tsx)$/i;
const MAX_CONTENT_CHARS = 24_000;
const MAX_CARDS = 5;
const SYSTEM_PROMPT = "Write onboarding flashcards grounded only in the supplied source file. Prefer behavior, control flow, and intent. Never invent APIs, paths, or behavior. Reply with JSON only: {\"cards\":[{\"question\":\"...\",\"answer\":\"...\"}]}. Return an empty cards array when nothing is worth asking.";

type ExtractInput = { path: string; content: string; sha: string };
export type CopilotRunner = (prompt: string) => Promise<string | null>;

export class CopilotExtractor implements QuestionExtractor {
  constructor(private readonly run: CopilotRunner = runCopilot) {}

  async extract(input: ExtractInput): Promise<GeneratedCard[]> {
    if (!CODE_EXTENSIONS.test(input.path) || input.content.trim().length === 0) return [];
    const reply = await this.run(promptFor(input));
    return reply === null ? [] : attributedCards(reply, input);
  }
}

export class AnthropicExtractor implements QuestionExtractor {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async extract(input: ExtractInput): Promise<GeneratedCard[]> {
    if (!CODE_EXTENSIONS.test(input.path) || input.content.trim().length === 0) return [];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2_000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: promptFor(input, false) }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const payload = await response.json() as { content?: Array<{ type?: unknown; text?: unknown }> };
      const reply = payload.content?.find((part) => part.type === "text")?.text;
      return typeof reply === "string" ? attributedCards(reply, input) : [];
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }
}

function promptFor(input: ExtractInput, includeSystem = true): string {
  const content = input.content.length > MAX_CONTENT_CHARS
    ? `${input.content.slice(0, MAX_CONTENT_CHARS)}\n... file truncated ...`
    : input.content;
  const prompt = `File: ${input.path}\nWrite at most ${MAX_CARDS} cards.\n\n${content}`;
  return includeSystem ? `${SYSTEM_PROMPT}\n\n${prompt}` : prompt;
}

function attributedCards(reply: string, input: ExtractInput): GeneratedCard[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(reply);
  const candidate = fenced?.[1]?.trim() ?? reply.trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return [];

  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as { cards?: unknown };
    if (!Array.isArray(parsed.cards)) return [];
    return parsed.cards.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const { question, answer } = entry as { question?: unknown; answer?: unknown };
      if (typeof question !== "string" || typeof answer !== "string") return [];
      if (!question.trim() || !answer.trim()) return [];
      return [{ question: question.trim(), answer: answer.trim(), source: { path: input.path, sha: input.sha } }];
    }).slice(0, MAX_CARDS);
  } catch {
    return [];
  }
}

async function runCopilot(prompt: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("copilot", [
      "-p", prompt, "--silent", "--no-custom-instructions", "--no-ask-user", "--no-color",
    ], { timeout: 120_000, maxBuffer: 1_000_000 });
    return stdout;
  } catch {
    return null;
  }
}
