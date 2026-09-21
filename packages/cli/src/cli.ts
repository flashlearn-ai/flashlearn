import { isAbsolute, resolve, sep } from "node:path";
import { flashlearnRoot } from "./paths.js";
import type { Card } from "../../../contracts/index.js";
import type { CliWorkstream, ProjectStatus, StartOptions } from "./workstream.js";
import type { GenerationProvider, GenerateOptions, GenerationProgress } from "./dependencies.js";
import { toYaml } from "./yaml.js";

export const CLI_VERSION = "0.3.0";

export const HELP = `Usage: flashlearn <command> [directory] [options]

Commands:
  init [directory]       Create empty storage (optional)
  generate [directory]   Initialize storage and generate cards
  start [directory]      Start the local learning server
  project show            Show this invocation's project directory
  project status          Show project learning status
  question list           List generated questions
  question get <card-id>  Get one question and answer

Start options:
  --host <host>           Host to bind (default: localhost)
  --port <port>           Port to bind (default: 4173)
  -y, --yes               Generate cards for an empty deck without prompting

Generate options:
  --subpath <path>        Scan a repository-relative directory
  --max-files <number>    Limit eligible files after importance ranking
  --copilot              Use Copilot for this run (explicit opt-in)
  --copilot-model <name>  Copilot model (default: auto; implies --copilot)

Query options:
  -o, --output <format>   Output as text, json, or yaml (default: text)

General options:
  -p, --project <directory>  Project directory (default: working directory)
  -h, --help              Show help
  -v, --version           Show version`;

const COMMAND_HELP: Record<string, string> = {
  init: `Usage: flashlearn init [directory] [options]\n\nOptional: create empty .flashlearn storage. Generate performs this step automatically.`,
  generate: `Usage: flashlearn generate [directory] [options]\n\nInitialize missing storage and generate at most 100 cards per run. No separate init is needed.\n\nOptions:\n  --subpath <path>      Scan a repository-relative directory\n  --max-files <number>  Limit eligible files after importance ranking\n  --copilot            Opt into Copilot generation (model: auto)\n  --copilot-model <name>  Override the model; implies --copilot`,
  start: `Usage: flashlearn start [directory] [options]\n\nStart the local learning server. Offer generation if the deck is empty.\n\nOptions:\n  --host <host>  Host to bind (default: localhost)\n  --port <port>  Port to bind (default: 4173)\n  -y, --yes     Approve empty-deck generation (may use the configured AI endpoint)`,
  project: `Usage: flashlearn project <command> [options]\n\nCommands:\n  show    Show this invocation's project directory\n  status  Show project learning status\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
  "project show": `Usage: flashlearn project show [options]\n\nShow this invocation's project directory.\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
  "project status": `Usage: flashlearn project status [options]\n\nShow card and review counts for this invocation's project.\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
  question: `Usage: flashlearn question <command> [options]\n\nCommands:\n  list           List generated questions\n  get <card-id>  Get one question, answer, and source\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
  "question list": `Usage: flashlearn question list [options]\n\nList questions from this invocation's project.\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
  "question get": `Usage: flashlearn question get <card-id> [options]\n\nGet one question, answer, and source from this invocation's project.\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
};

export type CliIO = {
  cwd: string;
  stdout(message: string): void;
  stderr(message: string): void;
  confirm?(message: string): Promise<boolean>;
  prompt?(message: string, secret?: boolean): Promise<string | null>;
  detectCopilot?(): Promise<boolean>;
  endpointConfigured?: boolean;
  progress?(progress: GenerationProgress): void;
};

class UsageError extends Error {}

export async function runCli(args: string[], service: CliWorkstream, io: CliIO): Promise<number> {
  try {
    const parsed = parseProjectFlag(args);
    args = parsed.args;
    const project = resolve(io.cwd, parsed.directory ?? ".");
    const help = helpFor(args);
    if (help) {
      io.stdout(help);
      return 0;
    }
    if (args[0] === "--version" || args[0] === "-v") {
      if (args.length !== 1) throw new UsageError("--version does not accept arguments");
      io.stdout(CLI_VERSION);
      return 0;
    }

    const [command, ...commandArgs] = args;
    if (command === "project") {
      const [subcommand, ...subcommandArgs] = commandArgs;
      if (subcommand === "set") {
        throw new UsageError("project set was removed. Use --project <directory> on each command; the default is the working directory.");
      }
      if (subcommand === "show" || subcommand === "status") {
        const { positional, format } = parseQuery(subcommandArgs);
        if (positional.length) throw new UsageError(`project ${subcommand} does not accept arguments`);
        io.stderr(`Project: ${project}`);
        if (subcommand === "show") {
          await service.resolveProject(project);
          io.stdout(formatValue({ project }, format, ({ project: path }) => path));
        } else {
          const status = await service.status(project);
          io.stdout(formatValue(status, format, formatStatus));
        }
        return 0;
      }
      throw new UsageError(`Unknown project command: ${subcommand ?? "(missing)"}`);
    }
    if (command === "question") {
      const [subcommand, ...subcommandArgs] = commandArgs;
      const { positional, format } = parseQuery(subcommandArgs);
      if (subcommand === "get") {
        if (positional.length !== 1) throw new UsageError("question get requires one card ID");
        io.stderr(`Project: ${project}`);
        const card = await service.getCard(positional[0]!, project);
        if (!card) throw new Error(`Card not found: ${positional[0]}`);
        io.stdout(formatValue(card, format, formatCard));
      } else if (subcommand === "list") {
        if (positional.length) throw new UsageError("question list does not accept arguments");
        io.stderr(`Project: ${project}`);
        const cards = await service.listCards(project);
        io.stdout(formatValue(cards, format, formatCardList));
      } else {
        throw new UsageError(`Unknown question command: ${subcommand ?? "(missing)"}`);
      }
      return 0;
    }
    if (command === "init" || command === "generate") {
      const { directory: directoryArgument, options } = command === "generate"
        ? parseGenerate(commandArgs)
        : { directory: parseDirectoryOnly(commandArgs), options: undefined };
      const directory = workflowDirectory(directoryArgument, parsed.directory, io.cwd);
      io.stderr(`Project: ${directory}`);
      if (command === "init") {
        await service.initialize(directory);
        io.stdout(`Initialized ${flashlearnRoot(directory)}`);
        io.stdout("");
        io.stdout("Next:");
        io.stdout("  # Generate study cards from this repository");
        io.stdout(`  flashlearn generate --project ${quoteArgument(directory)}`);
      } else {
        if (!await generateForStudy(service, io, directory, await generationOptions(io, options))) return 1;
        io.stdout("");
        io.stdout("Next:");
        io.stdout("  # Start the local learning experience");
        io.stdout(`  flashlearn start --project ${quoteArgument(directory)}`);
      }
      return 0;
    }
    if (command === "start") {
      const { directory: directoryArgument, options, yes } = parseStart(commandArgs);
      const directory = workflowDirectory(directoryArgument, parsed.directory, io.cwd);
      io.stderr(`Project: ${directory}`);
      if (!(await service.listCards(directory)).length) {
        const generateCommand = `flashlearn generate --project ${quoteArgument(directory)}`;
        io.stderr(`No study cards found in ${flashlearnRoot(directory)}.`);
        const approved = yes || await io.confirm?.(`Run ${generateCommand} first? This initializes storage and may use the configured AI endpoint. [y/N] `);
        if (!approved) {
          io.stderr(`Required first step:\n  ${generateCommand}\nThen:\n  flashlearn start --project ${quoteArgument(directory)}\nOr approve empty-deck generation with start --yes.`);
          return 1;
        }
        if (!await generateForStudy(service, io, directory, await generationOptions(io))) return 1;
      }
      await service.start(directory, options);
      const url = `http://${options.host ?? "localhost"}:${options.port ?? 4173}`;
      io.stdout(`FlashLearn running at ${url}`);
      io.stdout("");
      io.stdout("Next:");
      io.stdout("  # Open this URL in your browser to begin reviewing");
      io.stdout(`  ${url}`);
      return 0;
    }
    throw new UsageError(`Unknown command: ${command}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    io.stderr(`Error: ${message}`);
    if (error instanceof UsageError) {
      io.stderr("Run `flashlearn --help` for usage.");
      return 2;
    }
    return 1;
  }
}

async function generationOptions(io: CliIO, options: GenerateOptions = {}): Promise<GenerateOptions> {
  if (options.provider?.kind === "copilot") {
    if (!await io.detectCopilot?.()) throw new Error("Copilot CLI is unavailable on PATH. Install/authenticate Copilot or omit --copilot for provider setup.");
    const model = options.copilotModel ?? "auto";
    io.stderr(`Using GitHub Copilot CLI (model: ${model}). Up to 100 cards; code is sent to Copilot.`);
    return { ...options, provider: { kind: "copilot", model } };
  }
  if (io.endpointConfigured) {
    io.stderr("Using the configured inference endpoint.");
    return options;
  }

  if (io.confirm && await io.detectCopilot?.()) {
    const approved = await io.confirm("GitHub Copilot CLI was found on PATH. Use `copilot -p` to generate cards from source files? [y/N] ");
    if (approved) {
      io.stderr("Using GitHub Copilot CLI for code card generation (model: auto; up to 100 cards).");
      return { ...options, provider: { kind: "copilot" } };
    }
  }

  if (!io.prompt) return deterministicOptions(io, options, "No interactive provider setup is available.");
  const choice = (await io.prompt("Generation provider [deterministic/openai/claude/custom] (default deterministic): "))?.trim().toLowerCase();
  if (!choice || choice === "deterministic") return deterministicOptions(io, options, "Deterministic generation selected.");

  let provider: GenerationProvider | null = null;
  if (choice === "openai") {
    const apiKey = await requiredSecret(io, "OpenAI API key (current run only): ");
    const model = await withDefault(io, "OpenAI model [gpt-4o-mini]: ", "gpt-4o-mini");
    if (apiKey && model) provider = { kind: "endpoint", url: "https://api.openai.com/v1/chat/completions", model, apiKey };
  } else if (choice === "claude") {
    const apiKey = await requiredSecret(io, "Anthropic API key (current run only): ");
    const model = await withDefault(io, "Claude model [claude-sonnet-4-5]: ", "claude-sonnet-4-5");
    if (apiKey && model) provider = { kind: "anthropic", apiKey, model };
  } else if (choice === "custom") {
    const url = (await io.prompt("OpenAI-compatible chat-completions URL: "))?.trim();
    const model = (await io.prompt("Model or deployment name: "))?.trim();
    const apiKey = (await io.prompt("API key (optional, current run only): ", true))?.trim();
    const authHeader = apiKey ? (await withDefault(io, "Authentication header [Authorization]: ", "Authorization")) : null;
    if (url && model) {
      if (!apiKey) provider = { kind: "endpoint", url, model };
      else if (authHeader) provider = { kind: "endpoint", url, model, apiKey, authHeader };
    }
  } else {
    return deterministicOptions(io, options, `Unknown provider "${choice}".`);
  }

  if (!provider) return deterministicOptions(io, options, "Provider setup was incomplete.");
  io.stderr("Using the selected AI provider. Source files will be sent to that provider; the API key will not be saved.");
  return { ...options, provider };
}

async function requiredSecret(io: CliIO, message: string): Promise<string | null> {
  return (await io.prompt?.(message, true))?.trim() || null;
}

async function withDefault(io: CliIO, message: string, fallback: string): Promise<string | null> {
  const value = await io.prompt?.(message);
  return value === null || value === undefined ? null : value.trim() || fallback;
}

function deterministicOptions(io: CliIO, options: GenerateOptions, reason: string): GenerateOptions {
  io.stderr(`${reason} Falling back to deterministic generation; no source code will be sent to an AI provider.`);
  return { ...options, provider: { kind: "deterministic" } };
}

async function generateForStudy(service: CliWorkstream, io: CliIO, directory: string, options?: GenerateOptions): Promise<boolean> {
  io.stderr("Generating up to 100 study cards...");
  let current: GenerationProgress = { phase: "scanning", completed: 0, total: 0, cards: 0 };
  const onProgress = (progress: GenerationProgress) => { current = { ...progress, message: undefined }; io.progress?.(progress); };
  const timer = io.progress ? setInterval(() => io.progress?.(current), 1_000) : undefined;
  let cards: Card[];
  try {
    cards = await service.generate(directory, io.progress ? { ...options, onProgress } : options);
  } finally {
    if (timer) clearInterval(timer);
  }
  io.stdout(`Generated and stored ${cards.length} card${cards.length === 1 ? "" : "s"} (new or updated).`);
  const available = (await service.listCards(directory)).length;
  if (!available) {
    io.stderr("No study cards are available. Add supported source/docs or check extraction configuration, then run generate again.");
    return false;
  }
  io.stdout(`Study deck: ${available} card${available === 1 ? "" : "s"} available.`);
  return true;
}

function workflowDirectory(positional: string | undefined, flag: string | undefined, cwd: string): string {
  if (positional !== undefined && flag !== undefined) throw new UsageError("Use either a positional directory or --project, not both");
  return resolve(cwd, flag ?? positional ?? ".");
}

function parseProjectFlag(args: string[]): { args: string[]; directory?: string } {
  const rest: string[] = [];
  let directory: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--project" || arg === "-p" || arg.startsWith("--project=")) {
      if (directory !== undefined) throw new UsageError("Specify --project only once");
      directory = arg.startsWith("--project=") ? arg.slice("--project=".length) : requireValue(args, ++index, arg);
      if (!directory.trim()) throw new UsageError("--project requires a directory");
    } else {
      rest.push(arg);
    }
  }
  return { args: rest, directory };
}

function helpFor(args: string[]): string | null {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") return HELP;
  const helpArgs = args[0] === "help" ? args.slice(1) : args;
  if (args[0] === "help" && helpArgs.length === 0) return HELP;

  const command = helpArgs[0];
  if (!command) return null;
  const subcommand = helpArgs[1];
  const requested = args[0] === "help" || helpArgs.includes("--help") || helpArgs.includes("-h");
  const bareGroup = (command === "project" || command === "question") && helpArgs.length === 1;
  if (!requested && !bareGroup) return null;

  const key = subcommand && subcommand !== "--help" && subcommand !== "-h"
    ? `${command} ${subcommand}`
    : command;
  const help = COMMAND_HELP[key] ?? COMMAND_HELP[command];
  return help ? `${help}\n\nProject option:\n  -p, --project <directory>  Project directory (default: working directory)` : HELP;
}

type OutputFormat = "text" | "json" | "yaml";

function parseQuery(args: string[]): { positional: string[]; format: OutputFormat } {
  const positional: string[] = [];
  let format: OutputFormat = "text";
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-o" || argument === "--output") {
      const value = requireValue(args, ++index, argument);
      if (value !== "text" && value !== "json" && value !== "yaml") {
        throw new UsageError("--output must be text, json, or yaml");
      }
      format = value;
    } else if (argument?.startsWith("-")) {
      throw new UsageError(`Unknown option: ${argument}`);
    } else if (argument) {
      positional.push(argument);
    }
  }
  return { positional, format };
}

function formatValue<T>(value: T, format: OutputFormat, text: (value: T) => string): string {
  if (format === "json") return JSON.stringify(value, null, 2);
  if (format === "yaml") return toYaml(value);
  return text(value);
}

function formatCard(card: Card): string {
  const tags = card.tags?.length ? `\nTags: ${card.tags.join(", ")}` : "";
  return `ID: ${card.id}\nQuestion: ${card.question}\nAnswer: ${card.answer}\nSource: ${card.source.path} @ ${card.source.sha}${tags}`;
}

function formatCardList(cards: Card[]): string {
  return cards.length ? cards.map(({ id, question }) => `${id}\t${question}`).join("\n") : "No cards found.";
}

function formatStatus(status: ProjectStatus): string {
  return `Project: ${status.project}\nCards: ${status.cards}\nReviewed: ${status.reviewed}\nUnreviewed: ${status.unreviewed}\nDue: ${status.due}`;
}

function quoteArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function parseDirectoryOnly(args: string[]): string | undefined {
  if (args.some((arg) => arg.startsWith("-"))) throw new UsageError(`Unknown option: ${args.find((arg) => arg.startsWith("-"))}`);
  if (args.length > 1) throw new UsageError("Expected at most one directory");
  return args[0];
}

function parseGenerate(args: string[]): { directory?: string; options: GenerateOptions } {
  const positional: string[] = [];
  const options: GenerateOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--copilot") {
      options.provider = { kind: "copilot" };
    } else if (arg === "--copilot-model") {
      if (options.copilotModel !== undefined) throw new UsageError("Specify --copilot-model only once");
      options.copilotModel = requireValue(args, ++index, arg).trim();
      if (!options.copilotModel) throw new UsageError("--copilot-model requires a model");
      options.provider = { kind: "copilot" };
    } else if (arg === "--subpath") {
      if (options.subpath !== undefined) throw new UsageError("Specify --subpath only once");
      options.subpath = requireValue(args, ++index, arg);
      if (!options.subpath.trim()) throw new UsageError("--subpath requires a path");
      if (isAbsolute(options.subpath) || options.subpath.split(sep).includes("..")) {
        throw new UsageError("--subpath must be a repository-relative directory without '..'");
      }
    } else if (arg === "--max-files") {
      if (options.maxFiles !== undefined) throw new UsageError("Specify --max-files only once");
      const value = requireValue(args, ++index, arg);
      options.maxFiles = Number(value);
      if (!/^\d+$/.test(value) || !Number.isSafeInteger(options.maxFiles) || options.maxFiles < 1) {
        throw new UsageError("--max-files must be a positive integer");
      }
    } else {
      positional.push(arg);
    }
  }
  return { directory: parseDirectoryOnly(positional), options };
}

function parseStart(args: string[]): { directory?: string; options: StartOptions; yes: boolean } {
  let directory: string | undefined;
  let yes = false;
  let host: string | undefined;
  let port: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--yes" || argument === "-y") {
      yes = true;
    } else if (argument === "--host") {
      host = requireValue(args, ++index, "--host");
      if (!host.trim()) throw new UsageError("--host cannot be empty");
      if (host === "0.0.0.0" || host === "::") throw new UsageError("--host must not use a wildcard address");
    } else if (argument === "--port") {
      const value = requireValue(args, ++index, "--port");
      port = Number(value);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new UsageError("--port must be an integer from 1 to 65535");
    } else if (argument?.startsWith("-")) {
      throw new UsageError(`Unknown option: ${argument}`);
    } else if (argument) {
      if (directory) throw new UsageError("Expected at most one directory");
      directory = argument;
    }
  }

  return { directory, options: { host, port }, yes };
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("-")) throw new UsageError(`${option} requires a value`);
  return value;
}
