import assert from "node:assert/strict";
import test from "node:test";
import { HELP, runCli } from "../src/cli.js";
import type { CliWorkstream, StartOptions } from "../src/workstream.js";
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

test("parses start directory, host, and port", async () => {
  const cli = new RecordingCli();
  const output = capture();
  assert.equal(await runCli(["start", "demo", "--host", "localhost", "--port", "8080"], cli, output.io), 0);
  assert.deepEqual(cli.calls, [{ method: "start", root: "/project/demo", options: { host: "localhost", port: 8080 } }]);
  assert.deepEqual(output.stdout, [
    "FlashLearn running at http://localhost:8080",
    "Next: open http://localhost:8080 in your browser",
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
    "Next: flashlearn generate '/project/new repo'",
  ]);
});

test("guides users from generation to start", async () => {
  const output = capture();
  assert.equal(await runCli(["generate", "demo"], new RecordingCli(), output.io), 0);
  assert.deepEqual(output.stdout, [
    "Generated and stored 0 cards",
    "Next: flashlearn start '/project/demo'",
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
