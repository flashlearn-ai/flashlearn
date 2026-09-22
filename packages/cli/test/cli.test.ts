import assert from "node:assert/strict";
import test from "node:test";
import { HELP, runCli } from "../src/cli.js";
import type { CliWorkstream, ProjectStatus, StartOptions } from "../src/workstream.js";
import type { Card } from "../../../contracts/index.js";
import type { GenerateOptions } from "../src/dependencies.js";

class RecordingCli implements CliWorkstream {
  calls: Array<{ method: string; root: string; options?: StartOptions }> = [];

  async initialize(root: string): Promise<void> {
    this.calls.push({ method: "initialize", root });
  }

  async generate(root: string): Promise<Card[]> {
    this.calls.push({ method: "generate", root });
    return [];
  }

  async start(root: string, options?: StartOptions): Promise<void> {
    this.calls.push({ method: "start", root, options });
  }

  async resolveProject(directory?: string): Promise<string> {
    return directory ?? "/project";
  }

  async getCard(id: string): Promise<Card | null> {
    return { id, question: "Question?", answer: "Answer.", source: { path: "src/a.ts", sha: "abc" }, tags: ["code"], createdAt: "now", updatedAt: "now" };
  }

  async listCards(): Promise<Card[]> {
    return [await this.getCard("card-1")].filter((card): card is Card => card !== null);
  }

  async status(): Promise<ProjectStatus> {
    return { project: "/project", cards: 3, reviewed: 1, unreviewed: 2, due: 2 };
  }
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { cwd: "/project", stdout: (value: string) => stdout.push(value), stderr: (value: string) => stderr.push(value) } };
}

test("shows help with a successful exit code", async () => {
  const output = capture();
  assert.equal(await runCli([], new RecordingCli(), output.io), 0);
  assert.equal(output.stdout[0], HELP);
  assert.deepEqual(output.stderr, []);
});

test("shows contextual help for bare command groups", async () => {
  for (const group of ["project", "question"]) {
    const output = capture();
    assert.equal(await runCli([group], new RecordingCli(), output.io), 0);
    assert.match(output.stdout[0] ?? "", new RegExp(`Usage: flashlearn ${group} <command>`));
    assert.deepEqual(output.stderr, []);
  }
});

test("shows contextual help for commands and subcommands", async () => {
  const cases = [
    [["init", "--help"], "Usage: flashlearn init [directory]"],
    [["start", "-h"], "Usage: flashlearn start [directory] [options]"],
    [["help", "project", "show"], "Usage: flashlearn project show [options]"],
    [["question", "get", "--help"], "Usage: flashlearn question get <card-id> [options]"],
  ] as const;

  for (const [args, usage] of cases) {
    const output = capture();
    assert.equal(await runCli([...args], new RecordingCli(), output.io), 0);
    assert.match(output.stdout[0] ?? "", new RegExp(usage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.deepEqual(output.stderr, []);
  }
});

test("removed project set explains per-command selection", async () => {
  const cli = new RecordingCli();
  const output = capture();
  assert.equal(await runCli(["project", "set", "demo"], cli, output.io), 2);
  assert.deepEqual(cli.calls, []);
  assert.match(output.stderr[0] ?? "", /Use --project/);
});

test("shows the selected project in text and JSON", async () => {
  const text = capture();
  assert.equal(await runCli(["project", "show"], new RecordingCli(), text.io), 0);
  assert.deepEqual(text.stdout, ["/project"]);

  const json = capture();
  assert.equal(await runCli(["project", "show", "-o", "json"], new RecordingCli(), json.io), 0);
  assert.deepEqual(JSON.parse(json.stdout[0] ?? "{}"), { project: "/project" });
});

test("gets a card as readable text", async () => {
  const output = capture();
  assert.equal(await runCli(["question", "get", "card-1"], new RecordingCli(), output.io), 0);
  assert.match(output.stdout[0] ?? "", /Question: Question\?/);
  assert.match(output.stdout[0] ?? "", /Answer: Answer\./);
});

test("lists cards as JSON", async () => {
  const output = capture();
  assert.equal(await runCli(["question", "list", "-o", "json"], new RecordingCli(), output.io), 0);
  assert.equal(JSON.parse(output.stdout[0] ?? "[]")[0].id, "card-1");
});

test("shows status as YAML", async () => {
  const output = capture();
  assert.equal(await runCli(["project", "status", "--output", "yaml"], new RecordingCli(), output.io), 0);
  assert.match(output.stdout[0] ?? "", /^project: "\/project"/);
  assert.match(output.stdout[0] ?? "", /due: 2$/);
});

test("rejects invalid output formats", async () => {
  const output = capture();
  assert.equal(await runCli(["question", "list", "-o", "xml"], new RecordingCli(), output.io), 2);
  assert.match(output.stderr[0] ?? "", /text, json, or yaml/);
});

test("parses start directory, host, and port", async () => {
  const cli = new RecordingCli();
  const output = capture();
  assert.equal(await runCli(["start", "demo", "--host", "localhost", "--port", "8080"], cli, output.io), 0);
  assert.deepEqual(cli.calls, [{ method: "start", root: "/project/demo", options: { host: "localhost", port: 8080 } }]);
  assert.deepEqual(output.stdout, [
    "FlashLearn running at http://localhost:8080",
    "",
    "Next:",
    "  # Open this URL in your browser to begin reviewing",
    "  http://localhost:8080",
  ]);
});

test("rejects wildcard server addresses", async () => {
  for (const host of ["0.0.0.0", "::"]) {
    const output = capture();
    assert.equal(await runCli(["start", "--host", host], new RecordingCli(), output.io), 2);
    assert.match(output.stderr[0] ?? "", /wildcard address/);
  }
});

test("guides first-time users from init to generate", async () => {
  const output = capture();
  assert.equal(await runCli(["init", "new repo"], new RecordingCli(), output.io), 0);
  assert.deepEqual(output.stdout, [
    "Initialized /project/new repo/.flashlearn",
    "",
    "Next:",
    "  # Generate study cards from this repository",
    "  flashlearn generate --project '/project/new repo'",
  ]);
});

test("guides users from generation to start", async () => {
  const output = capture();
  assert.equal(await runCli(["generate", "demo"], new RecordingCli(), output.io), 0);
  assert.deepEqual(output.stdout, [
    "Generated and stored 0 cards (new or updated).",
    "Study deck: 1 card available.",
    "",
    "Next:",
    "  # Start the local learning experience",
    "  flashlearn start --project '/project/demo'",
  ]);
});

test("uses the working directory when workflow directories are omitted", async () => {
  const cli = new RecordingCli();
  const output = capture();

  assert.equal(await runCli(["generate"], cli, output.io), 0);
  assert.equal(await runCli(["start"], cli, output.io), 0);

  assert.deepEqual(cli.calls, [
    { method: "generate", root: "/project" },
    { method: "start", root: "/project", options: { host: undefined, port: undefined } },
  ]);
});

test("returns exit code 2 for invalid arguments", async () => {
  const output = capture();
  assert.equal(await runCli(["start", "--port", "70000"], new RecordingCli(), output.io), 2);
  assert.match(output.stderr[0] ?? "", /port/);
});

test("returns exit code 1 for command failures", async () => {
  const output = capture();
  const cli = new RecordingCli();
  cli.initialize = async () => { throw new Error("disk unavailable"); };
  assert.equal(await runCli(["init"], cli, output.io), 1);
  assert.deepEqual(output.stderr, ["Project: /project", "Error: disk unavailable"]);
});

test("all command families use the explicit project or invocation cwd", async () => {
  for (const prefix of [[], ["--project", "another repo"], ["--project=/absolute"], ["-p", "../relative"]]) {
    const expected = prefix.length === 0 ? "/project" : prefix[0] === "--project=/absolute" ? "/absolute" : prefix[1] === "../relative" ? "/relative" : "/project/another repo";
    for (const args of [["init"], ["generate"], ["start"], ["project", "show"], ["project", "status"], ["question", "get", "id"], ["question", "list"]]) {
      const output = capture();
      const cli = new RecordingCli();
      const method = args[0] === "init" ? "initialize" : args[0] === "project" ? args[1] === "show" ? "resolveProject" : "status" : args[0] === "question" ? args[1] === "get" ? "getCard" : "listCards" : args[0] === "start" ? "listCards" : "generate";
      Object.defineProperty(cli, method, { value: async (...values: unknown[]) => {
        assert.equal(values[method === "getCard" ? 1 : 0], expected);
        assert.equal(output.stderr[0], `Project: ${expected}`);
        throw new Error("operation reached");
      } });
      assert.equal(await runCli([...prefix, ...args], cli, output.io), 1);
      assert.equal(output.stderr.at(-1), "Error: operation reached");
    }
  }
});

test("project flag works after commands and keeps structured stdout clean", async () => {
  const output = capture();
  assert.equal(await runCli(["project", "show", "-o", "json", "-p", "other"], new RecordingCli(), output.io), 0);
  assert.deepEqual(JSON.parse(output.stdout.join("\n")), { project: "/project/other" });
  assert.deepEqual(output.stderr, ["Project: /project/other"]);
});

test("rejects missing/repeated project flags and ambiguous positional selection", async () => {
  for (const args of [["init", "--project"], ["init", "--project="], ["init", "-p", "a", "--project", "b"], ["generate", "/old-dir", "-p", "new"], ["start", "old", "--project=new"]]) {
    const output = capture();
    const cli = new RecordingCli();
    assert.equal(await runCli(args, cli, output.io), 2);
    assert.deepEqual(cli.calls, []);
  }
});

test("start generates only after acceptance and continues in the same project", async () => {
  for (const approval of ["prompt", "--yes", "-y"]) {
    const output = capture();
    const cli = new RecordingCli();
    const sample = await cli.getCard("card-1");
    assert(sample);
    let cards: Card[] = [];
    const events: string[] = [];
    cli.listCards = async () => cards;
    cli.generate = async (root) => { events.push(`generate:${root}`); cards = [sample]; return cards; };
    cli.start = async (root) => { events.push(`start:${root}`); };
    const io = { ...output.io, confirm: async (message: string) => {
      assert.equal(approval, "prompt");
      assert.match(message, /configured AI endpoint/);
      events.push("prompt");
      return true;
    } };
    assert.equal(await runCli(["start", "-p", "demo", ...(approval === "prompt" ? [] : [approval])], cli, io), 0);
    assert.deepEqual(events, [...(approval === "prompt" ? ["prompt"] : []), "generate:/project/demo", "start:/project/demo"]);
  }
});

test("empty-deck start without approval gives prerequisites and does no work", async () => {
  for (const interactive of [false, true]) {
    const output = capture();
    const cli = new RecordingCli();
    cli.listCards = async () => [];
    assert.equal(await runCli(["start"], cli, interactive ? { ...output.io, confirm: async () => false } : output.io), 1);
    assert.deepEqual(cli.calls, []);
    assert.match(output.stderr.join("\n"), /Required first step:/);
    assert.match(output.stderr.join("\n"), /flashlearn generate --project '\/project'/);
  }
});

test("start --yes stops when generation fails or leaves an empty deck", async () => {
  for (const fails of [false, true]) {
    const output = capture();
    const cli = new RecordingCli();
    cli.listCards = async () => [];
    cli.generate = async (root) => {
      cli.calls.push({ method: "generate", root });
      if (fails) throw new Error("extraction unavailable");
      return [];
    };
    assert.equal(await runCli(["start", "--yes"], cli, output.io), 1);
    assert.deepEqual(cli.calls, [{ method: "generate", root: "/project" }]);
    assert.match(output.stderr.join("\n"), fails ? /extraction unavailable/ : /No study cards are available/);
  }
});

test("start with existing cards does not regenerate or prompt even with --yes", async () => {
  const output = capture();
  const cli = new RecordingCli();
  assert.equal(await runCli(["start", "--yes"], cli, { ...output.io, confirm: async () => { assert.fail("unexpected prompt"); } }), 0);
  assert.deepEqual(cli.calls.map(({ method }) => method), ["start"]);
});

test("generate distinguishes empty output from an empty study deck", async () => {
  const output = capture();
  const cli = new RecordingCli();
  cli.listCards = async () => [];
  assert.equal(await runCli(["generate"], cli, output.io), 1);
  assert.match(output.stderr.join("\n"), /run generate again/);
  assert(!output.stdout.join("\n").includes("flashlearn start"));
});

test("generate passes scoping options while retaining the repository root", async () => {
  const output = capture();
  const cli: CliWorkstream = new RecordingCli();
  cli.generate = async (root: string, options?: GenerateOptions) => {
    assert.equal(root, "/project/repo");
    assert.deepEqual(options, { subpath: "src", maxFiles: 3, provider: { kind: "deterministic" } });
    return [];
  };
  assert.equal(await runCli(["generate", "--subpath", "src", "--max-files", "3", "--project", "repo"], cli, output.io), 0);
});

test("generate offers a detected Copilot CLI and passes the selection", async () => {
  const output = capture();
  const cli = new RecordingCli();
  cli.generate = async (_root, options) => {
    assert.deepEqual(options, { provider: { kind: "copilot" } });
    return [];
  };
  const io = {
    ...output.io,
    detectCopilot: async () => true,
    confirm: async (message: string) => {
      assert.match(message, /copilot -p/);
      return true;
    },
  };

  assert.equal(await runCli(["generate"], cli, io), 0);
  assert.match(output.stderr.join("\n"), /Using GitHub Copilot CLI/);
});

test("explicit Copilot flags select auto or the requested model without prompting", async () => {
  for (const args of [["--copilot"], ["--copilot-model", "custom-model"]]) {
    const cli: CliWorkstream = new RecordingCli();
    cli.generate = async (_root, options) => {
      assert.deepEqual(options?.provider, { kind: "copilot", model: args[1] ?? "auto" });
      return [];
    };
    assert.equal(await runCli(["generate", ...args], cli, {
      ...capture().io, detectCopilot: async () => true,
      confirm: async () => { assert.fail("explicit opt-in should not prompt"); },
    }), 0);
  }
  const output = capture();
  assert.equal(await runCli(["generate", "--copilot"], new RecordingCli(), { ...output.io, detectCopilot: async () => false }), 1);
  assert.match(output.stderr.join("\n"), /unavailable on PATH/);
});

test("generate --fresh explicitly requests checkpoint replacement", async () => {
  const cli: CliWorkstream = new RecordingCli();
  cli.generate = async (_root, options) => {
    assert.equal(options?.fresh, true);
    return [];
  };
  assert.equal(await runCli(["generate", "--fresh"], cli, capture().io), 0);
  assert.equal(await runCli(["generate", "--fresh", "--fresh"], cli, capture().io), 2);
});

test("generate can configure OpenAI with an in-memory API key", async () => {
  const output = capture();
  const cli = new RecordingCli();
  cli.generate = async (_root, options) => {
    assert.deepEqual(options, {
      provider: {
        kind: "endpoint",
        url: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini",
        apiKey: "secret",
      },
    });
    return [];
  };
  const answers = ["openai", "secret", ""];
  const secrets: boolean[] = [];
  const io = {
    ...output.io,
    prompt: async (_message: string, secret = false) => {
      secrets.push(secret);
      return answers.shift() ?? null;
    },
  };

  assert.equal(await runCli(["generate"], cli, io), 0);
  assert.deepEqual(secrets, [false, true, false]);
  assert.match(output.stderr.join("\n"), /API key will not be saved/);
});

test("incomplete provider setup clearly falls back to deterministic generation", async () => {
  const output = capture();
  const cli = new RecordingCli();
  cli.generate = async (_root, options) => {
    assert.deepEqual(options, { provider: { kind: "deterministic" } });
    return [];
  };
  const answers = ["custom", "", "", ""];
  const io = { ...output.io, prompt: async () => answers.shift() ?? null };

  assert.equal(await runCli(["generate"], cli, io), 0);
  assert.match(output.stderr.join("\n"), /Falling back to deterministic generation/);
  assert.match(output.stderr.join("\n"), /no source code will be sent/);
});

test("configured endpoint skips interactive provider setup", async () => {
  const output = capture();
  const cli = new RecordingCli();
  cli.generate = async (_root, options) => {
    assert.deepEqual(options, {});
    return [];
  };
  const io = {
    ...output.io,
    endpointConfigured: true,
    detectCopilot: async () => true,
    confirm: async () => { assert.fail("unexpected confirmation"); return false; },
    prompt: async () => { assert.fail("unexpected prompt"); return null; },
  };

  assert.equal(await runCli(["generate"], cli, io), 0);
  assert.match(output.stderr.join("\n"), /configured inference endpoint/);
});

test("rejects invalid extraction limits and misplaced options before generation", async () => {
  for (const args of [
    ...["0", "-1", "1.5", "NaN", "Infinity", "1e2", "9007199254740992"].map((value) => ["generate", "--max-files", value]),
    ["generate", "--max-files"], ["generate", "--subpath"], ["generate", "--subpath", " "],
    ["generate", "--subpath", "../escape"], ["generate", "--subpath", "/absolute"],
    ["generate", "--max-files", "1", "--max-files", "2"],
    ["start", "--subpath", "src"], ["init", "--max-files", "2"],
  ]) {
    const cli = new RecordingCli();
    assert.equal(await runCli(args, cli, capture().io), 2);
    assert.deepEqual(cli.calls, []);
  }
});

test("question YAML preserves empty tags on a card and in a card list", async () => {
  const cli = new RecordingCli();
  const card = await cli.getCard("card-1");
  assert(card);
  card.tags = [];
  cli.getCard = async () => card;
  for (const subcommand of ["get", "list"]) {
    const output = capture();
    assert.equal(await runCli(["question", subcommand, ...(subcommand === "get" ? [card.id] : []), "-o", "yaml"], cli, output.io), 0);
    const indent = subcommand === "get" ? "" : "  ";
    const expected = [
      `${subcommand === "get" ? "" : "- "}id: "card-1"`,
      `${indent}question: "Question?"`,
      `${indent}answer: "Answer."`,
      `${indent}source:`,
      `${indent}  path: "src/a.ts"`,
      `${indent}  sha: "abc"`,
      `${indent}tags:`,
      `${indent}  []`,
      `${indent}createdAt: "now"`,
      `${indent}updatedAt: "now"`,
    ].join("\n");
    assert.equal(output.stdout.join("\n"), expected);
  }
  cli.listCards = async () => [];
  const output = capture();
  assert.equal(await runCli(["question", "list", "-o", "yaml"], cli, output.io), 0);
  assert.deepEqual(output.stdout, ["[]"]);
});
