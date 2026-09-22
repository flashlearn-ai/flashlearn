import assert from "node:assert/strict";
import test from "node:test";
import { selectInferenceSource } from "../src/inference-source.js";
import { runCli } from "../src/cli.js";
import { CliService } from "../src/workstream.js";
import { RecordingDependencies } from "./fakes/harness.js";

function io(answers: Array<string | null>) {
  const output: string[] = [], secrets: boolean[] = [];
  return { output, secrets, cwd: "/repo", stdout: (s: string) => output.push(s), stderr: (s: string) => output.push(s),
    detectCopilot: async () => true, prompt: async (_message: string, secret = false) => { secrets.push(secret); return answers.shift() ?? null; } };
}

test("inference stage offers every source even with Copilot installed and configures Claude privately", async () => {
  const context = io(["claude", "test-key", "claude-custom"]);
  const result = await selectInferenceSource(context);
  assert.deepEqual(result.provider, { kind: "anthropic", apiKey: "test-key", model: "claude-custom" });
  assert.deepEqual(context.secrets, [false, true, false]);
  assert.match(context.output.join("\n"), /INFERENCE SOURCE[\s\S]*copilot[\s\S]*openai[\s\S]*claude[\s\S]*custom[\s\S]*heuristic/);
  assert(!context.output.join("\n").includes("test-key"));
});

test("custom URL supports no auth and a raw-key header", async () => {
  for (const key of ["", "private-key"]) {
    const result = await selectInferenceSource(io(["custom", "http://localhost:1234/v1/chat/completions", "local", key, "api-key"]));
    assert.deepEqual(result.provider, { kind: "endpoint", url: "http://localhost:1234/v1/chat/completions", model: "local",
      ...(key ? { apiKey: key, authHeader: "api-key" } : {}) });
  }
});

test("custom URL/header validation fails before inference and does not print secrets", async () => {
  for (const url of ["relative/path", "file:///tmp/a", "https://user:secret@example.test/chat"]) {
    const context = io(["custom", url]);
    await assert.rejects(selectInferenceSource(context), /URL/);
    assert(!context.output.join("\n").includes("secret"));
  }
  await assert.rejects(selectInferenceSource(io(["custom", "https://example.test/chat", "m", "key", "bad\nheader"])), /header name/);
});

test("explicit source overrides configured endpoint; empty input stays offline", async () => {
  const context = { ...io([]), endpointConfigured: true };
  assert.equal((await selectInferenceSource(context, { inferenceSource: "heuristic" })).provider?.kind, "deterministic");
  assert.equal((await selectInferenceSource(io([""]))).provider?.kind, "deterministic");
  assert.equal((await selectInferenceSource(io(["openai", ""]))).provider?.kind, "deterministic");
  await assert.rejects(selectInferenceSource(io(["unknown"])), /Unknown inference source/);
});

test("source flag rejects conflicts and invalid sources before generation", async () => {
  for (const args of [["--inference-source", "unknown"], ["--inference-source"], ["--inference-source", "heuristic", "--copilot"], ["--inference-source", "claude", "--inference-source", "openai"]]) {
    const context = io([]);
    assert.equal(await runCli(["generate", ...args], new CliService(new RecordingDependencies()), context), 2);
  }
});
