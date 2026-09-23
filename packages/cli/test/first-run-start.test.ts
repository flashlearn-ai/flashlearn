import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { runCli, type CliIO } from "../src/cli.js";
import { createProductionDependencies } from "../src/production.js";
import { CliService } from "../src/workstream.js";

async function setup(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-first-start-"));
  const dependencies = createProductionDependencies();
  let server: Server | undefined;
  t.after(async () => {
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    }
    await rm(root, { recursive: true, force: true });
  });
  // Use the production HTTP server, with an ephemeral port for test isolation.
  dependencies.listenServer = async (handle) => {
    server = handle as Server;
    await new Promise<void>((resolve, reject) => {
      server!.once("error", reject);
      server!.listen(0, "127.0.0.1", resolve);
    });
  };
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CliIO = {
    cwd: root,
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
    detectCopilot: async () => false,
  };
  return {
    root, dependencies, io, stdout, stderr,
    service: new CliService(dependencies),
    server: () => server,
  };
}

for (const initialized of [false, true]) {
  test(`first start offers and completes setup with ${initialized ? "empty storage" : "no storage"}`, async (t) => {
    const context = await setup(t);
    const { root, service, io } = context;
    await writeFile(join(root, "README.md"), "# Retry policy\nFailed requests use exponential backoff with jitter to avoid overwhelming an unavailable server.\n");
    if (initialized) await service.initialize(root);
    const events: string[] = [];
    io.confirm = async (message) => {
      assert.match(message, /Run flashlearn generate/);
      assert.match(message, /initializes storage/);
      assert.equal(context.server(), undefined);
      events.push("approve setup");
      return true;
    };
    io.prompt = async (message) => {
      assert.match(message, /Inference source/);
      events.push("select provider");
      return "deterministic";
    };

    assert.equal(await runCli(["start"], service, io), 0);
    assert.deepEqual(events, ["approve setup", "select provider"]);
    for (const name of ["cards.json", "review.json", "settings.json"]) {
      await access(join(root, ".flashlearn", name));
    }
    const cards = await service.listCards(root);
    assert.equal(cards.length, 1);
    assert.equal(cards[0]?.source.path, "README.md");
    const address = context.server()!.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/cards`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), cards);
    assert.match(context.stderr.join("\n"), /deterministic generation/);
    assert.match(context.stdout.join("\n"), /FlashLearn running/);
  });
}

test("declining first-start setup leaves a fresh repository untouched", async (t) => {
  const { root, service, io, server } = await setup(t);
  let offered = false;
  io.confirm = async () => { offered = true; return false; };
  io.prompt = async () => { assert.fail("provider setup must follow approval"); };
  assert.equal(await runCli(["start"], service, io), 1);
  assert(offered);
  assert.equal(server(), undefined);
  await assert.rejects(access(join(root, ".flashlearn")), { code: "ENOENT" });
});

test("approved first-start setup stops when extraction produces an empty deck", async (t) => {
  const { root, service, io, server, stderr, stdout } = await setup(t);
  io.confirm = async () => true;
  assert.equal(await runCli(["start"], service, io), 1);
  assert.deepEqual(JSON.parse(await readFile(join(root, ".flashlearn/cards.json"), "utf8")), []);
  assert.equal(server(), undefined);
  assert.match(stderr.join("\n"), /No study cards are available/);
  assert(!stdout.join("\n").includes("FlashLearn running"));
});

test("start --yes bootstraps without a setup confirmation and preserves an existing deck on restart", async (t) => {
  const { root, service, io, dependencies, server } = await setup(t);
  await writeFile(join(root, "README.md"), "# Request routing\nThe router matches incoming HTTP paths and dispatches each request to the registered service handler.\n");
  io.confirm = async () => { assert.fail("unexpected setup confirmation"); };
  assert.equal(await runCli(["start", "--yes"], service, io), 0);
  const original = await readFile(join(root, ".flashlearn/cards.json"), "utf8");
  server()!.closeAllConnections();
  await new Promise<void>((resolve, reject) => server()!.close((error) => error ? reject(error) : resolve()));
  dependencies.generateCards = async () => { assert.fail("existing decks must not regenerate"); };
  io.prompt = async () => { assert.fail("existing decks must not prompt for a provider"); };
  assert.equal(await runCli(["start"], service, io), 0);
  assert.equal(await readFile(join(root, ".flashlearn/cards.json"), "utf8"), original);
});
