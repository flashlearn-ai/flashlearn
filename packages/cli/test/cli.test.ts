import assert from "node:assert/strict";
import test from "node:test";
import { HELP, runCli } from "../src/cli.js";
import type { CliWorkstream, ProjectStatus, StartOptions } from "../src/workstream.js";
import type { Card } from "../../../contracts/index.js";

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

  async setProject(root: string): Promise<string> {
    this.calls.push({ method: "set-project", root });
    return root;
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

test("sets the default project", async () => {
  const cli = new RecordingCli();
  const output = capture();
  assert.equal(await runCli(["project", "set", "demo"], cli, output.io), 0);
  assert.deepEqual(cli.calls, [{ method: "set-project", root: "/project/demo" }]);
  assert.match(output.stdout[0] ?? "", /Project saved: \/project\/demo/);
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
    "Active project: /project/new repo",
    "",
    "Next:",
    "  # Generate study cards from this repository",
    "  flashlearn generate",
  ]);
});

test("guides users from generation to start", async () => {
  const output = capture();
  assert.equal(await runCli(["generate", "demo"], new RecordingCli(), output.io), 0);
  assert.deepEqual(output.stdout, [
    "Generated and stored 0 cards",
    "",
    "Next:",
    "  # Start the local learning experience",
    "  flashlearn start '/project/demo'",
  ]);
});

test("uses the selected project when workflow directories are omitted", async () => {
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
  assert.equal(output.stderr[0], "Error: disk unavailable");
});
