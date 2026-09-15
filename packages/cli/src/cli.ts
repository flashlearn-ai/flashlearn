import { resolve } from "node:path";
import { flashlearnRoot } from "./paths.js";
import type { Card } from "../../../contracts/index.js";
import type { CliWorkstream, ProjectStatus, StartOptions } from "./workstream.js";

export const CLI_VERSION = "0.0.0";

export const HELP = `Usage: flashlearn <command> [directory] [options]

Commands:
  init [directory]       Initialize a FlashLearn project
  generate [directory]   Generate and store cards
  start [directory]      Start the local learning server
  project set <directory> Save the default project directory
  project show            Show the selected project directory
  project status          Show project learning status
  question list           List generated questions
  question get <card-id>  Get one question and answer

Start options:
  --host <host>           Host to bind (default: localhost)
  --port <port>           Port to bind (default: 4173)

Query options:
  -o, --output <format>   Output as text, json, or yaml (default: text)

General options:
  -h, --help              Show help
  -v, --version           Show version`;

const COMMAND_HELP: Record<string, string> = {
  init: `Usage: flashlearn init [directory]\n\nInitialize .flashlearn state and select the project.`,
  generate: `Usage: flashlearn generate [directory]\n\nGenerate and store questions for a project. Uses the selected project when directory is omitted.`,
  start: `Usage: flashlearn start [directory] [options]\n\nStart the local learning server. Uses the selected project when directory is omitted.\n\nOptions:\n  --host <host>  Host to bind (default: localhost)\n  --port <port>  Port to bind (default: 4173)`,
  project: `Usage: flashlearn project <command> [options]\n\nCommands:\n  set <directory>  Save the default project directory\n  show             Show the selected project directory\n  status           Show project learning status\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
  "project set": `Usage: flashlearn project set <directory>\n\nValidate and save the default project directory.`,
  "project show": `Usage: flashlearn project show [options]\n\nShow the effective project selected by FLASHLEARN_PROJECT or saved configuration.\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
  "project status": `Usage: flashlearn project status [options]\n\nShow card and review counts for the selected project.\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
  question: `Usage: flashlearn question <command> [options]\n\nCommands:\n  list           List generated questions\n  get <card-id>  Get one question, answer, and source\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
  "question list": `Usage: flashlearn question list [options]\n\nList questions from the selected project.\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
  "question get": `Usage: flashlearn question get <card-id> [options]\n\nGet one question, answer, and source from the selected project.\n\nOptions:\n  -o, --output <format>  text, json, or yaml`,
};

export type CliIO = {
  cwd: string;
  stdout(message: string): void;
  stderr(message: string): void;
};

class UsageError extends Error {}

export async function runCli(args: string[], service: CliWorkstream, io: CliIO): Promise<number> {
  try {
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
        const directory = subcommandArgs[0];
        if (subcommandArgs.length !== 1 || !directory || directory.startsWith("-")) throw new UsageError("project set requires one directory");
        const root = await service.setProject(resolve(io.cwd, directory));
        io.stdout(`Project saved: ${root}`);
        io.stdout(`Future commands will use this project. Override it with FLASHLEARN_PROJECT=${quoteArgument(root)}.`);
        return 0;
      }
      if (subcommand === "show" || subcommand === "status") {
        const { positional, format } = parseQuery(subcommandArgs);
        if (positional.length) throw new UsageError(`project ${subcommand} does not accept arguments`);
        if (subcommand === "show") {
          const project = await service.resolveProject();
          io.stdout(formatValue({ project }, format, ({ project: path }) => path));
        } else {
          const status = await service.status();
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
        const card = await service.getCard(positional[0]!);
        if (!card) throw new Error(`Card not found: ${positional[0]}`);
        io.stdout(formatValue(card, format, formatCard));
      } else if (subcommand === "list") {
        if (positional.length) throw new UsageError("question list does not accept arguments");
        const cards = await service.listCards();
        io.stdout(formatValue(cards, format, formatCardList));
      } else {
        throw new UsageError(`Unknown question command: ${subcommand ?? "(missing)"}`);
      }
      return 0;
    }
    if (command === "init" || command === "generate") {
      const directoryArgument = parseDirectoryOnly(commandArgs);
      if (command === "init") {
        const directory = resolve(io.cwd, directoryArgument ?? ".");
        await service.initialize(directory);
        io.stdout(`Initialized ${flashlearnRoot(directory)}`);
        io.stdout(`Active project: ${directory}`);
        io.stdout("");
        io.stdout("Next:");
        io.stdout("  # Generate study cards from this repository");
        io.stdout("  flashlearn generate");
      } else {
        const directory = await service.resolveProject(directoryArgument ? resolve(io.cwd, directoryArgument) : undefined);
        const cards = await service.generate(directory);
        io.stdout(`Generated and stored ${cards.length} card${cards.length === 1 ? "" : "s"}`);
        io.stdout("");
        io.stdout("Next:");
        io.stdout("  # Start the local learning experience");
        io.stdout(`  flashlearn start ${quoteArgument(directory)}`);
      }
      return 0;
    }
    if (command === "start") {
      const { directory: directoryArgument, options } = parseStart(commandArgs);
      const directory = await service.resolveProject(directoryArgument ? resolve(io.cwd, directoryArgument) : undefined);
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
  return COMMAND_HELP[key] ?? COMMAND_HELP[command] ?? HELP;
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

function toYaml(value: unknown, indent = 0): string {
  const space = " ".repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return value.map((item) => {
      if (isScalar(item)) return `${space}- ${yamlScalar(item)}`;
      const nested = toYaml(item, indent + 2).split("\n");
      return `${space}-${nested.map((line, index) => index === 0 ? ` ${line.trimStart()}` : `\n${line}`).join("")}`;
    }).join("\n");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return "{}";
    return entries.map(([key, item]) => isScalar(item)
      ? `${space}${key}: ${yamlScalar(item)}`
      : `${space}${key}:\n${toYaml(item, indent + 2)}`).join("\n");
  }
  return `${space}${yamlScalar(value)}`;
}

function isScalar(value: unknown): boolean {
  return value === null || typeof value !== "object";
}

function yamlScalar(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === undefined) return "null";
  return String(value);
}

function quoteArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function parseDirectoryOnly(args: string[]): string | undefined {
  if (args.some((arg) => arg.startsWith("-"))) throw new UsageError(`Unknown option: ${args.find((arg) => arg.startsWith("-"))}`);
  if (args.length > 1) throw new UsageError("Expected at most one directory");
  return args[0];
}

function parseStart(args: string[]): { directory?: string; options: StartOptions } {
  let directory: string | undefined;
  let host: string | undefined;
  let port: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--host") {
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

  return { directory, options: { host, port } };
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("-")) throw new UsageError(`${option} requires a value`);
  return value;
}
