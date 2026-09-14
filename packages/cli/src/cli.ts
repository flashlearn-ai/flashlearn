import { resolve } from "node:path";
import type { CliWorkstream, StartOptions } from "./workstream.js";

export const CLI_VERSION = "0.0.0";

export const HELP = `Usage: flashlearn <command> [directory] [options]

Commands:
  init [directory]       Initialize a FlashLearn project
  generate [directory]   Generate and store cards
  start [directory]      Start the local learning server

Start options:
  --host <host>           Host to bind (default: 127.0.0.1)
  --port <port>           Port to bind (default: 4173)

General options:
  -h, --help              Show help
  -v, --version           Show version`;

export type CliIO = {
  cwd: string;
  stdout(message: string): void;
  stderr(message: string): void;
};

class UsageError extends Error {}

export async function runCli(args: string[], service: CliWorkstream, io: CliIO): Promise<number> {
  try {
    if (args.length === 0 || args[0] === "help" || args.includes("--help") || args.includes("-h")) {
      io.stdout(HELP);
      return 0;
    }
    if (args[0] === "--version" || args[0] === "-v") {
      if (args.length !== 1) throw new UsageError("--version does not accept arguments");
      io.stdout(CLI_VERSION);
      return 0;
    }

    const [command, ...commandArgs] = args;
    if (command === "init" || command === "generate") {
      const directory = parseDirectoryOnly(commandArgs, io.cwd);
      if (command === "init") {
        await service.initialize(directory);
        io.stdout(`Initialized ${resolve(directory, ".flashlearn")}`);
      } else {
        const cards = await service.generate(directory);
        io.stdout(`Generated and stored ${cards.length} card${cards.length === 1 ? "" : "s"}`);
      }
      return 0;
    }
    if (command === "start") {
      const { directory, options } = parseStart(commandArgs, io.cwd);
      await service.start(directory, options);
      io.stdout(`FlashLearn running at http://${options.host ?? "127.0.0.1"}:${options.port ?? 4173}`);
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

function parseDirectoryOnly(args: string[], cwd: string): string {
  if (args.some((arg) => arg.startsWith("-"))) throw new UsageError(`Unknown option: ${args.find((arg) => arg.startsWith("-"))}`);
  if (args.length > 1) throw new UsageError("Expected at most one directory");
  return resolve(cwd, args[0] ?? ".");
}

function parseStart(args: string[], cwd: string): { directory: string; options: StartOptions } {
  let directory: string | undefined;
  let host: string | undefined;
  let port: number | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--host") {
      host = requireValue(args, ++index, "--host");
      if (!host.trim()) throw new UsageError("--host cannot be empty");
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

  return { directory: resolve(cwd, directory ?? "."), options: { host, port } };
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("-")) throw new UsageError(`${option} requires a value`);
  return value;
}
