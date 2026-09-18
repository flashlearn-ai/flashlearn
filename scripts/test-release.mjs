import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { ROOT, npmCommand, releaseManifest, run } from "./release-lib.mjs";

const manifest = await releaseManifest();
const tarball = join(ROOT, ".release/flashlearn.tgz");
const receipt = JSON.parse(await readFile(join(ROOT, ".release/artifact.json"), "utf8"));
assert.equal(receipt.name, manifest.name);
assert.equal(receipt.version, manifest.version);
assert.equal(receipt.sha256, createHash("sha256").update(await readFile(tarball)).digest("hex"));
const temp = await mkdtemp(join(tmpdir(), "flashlearn installed "));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_") && !key.startsWith("FLASHLEARN_") && !key.startsWith("NODE_")));
env.XDG_CONFIG_HOME = join(temp, "config");
let server;
try {
  await writeFile(join(temp, "package.json"), '{"private":true}');
  run(npmCommand, ["install", tarball, "--ignore-scripts", "--no-audit", "--no-fund"], { cwd: temp, env });
  const installedRoot = join(temp, "node_modules", manifest.name);
  const installedManifest = JSON.parse(await readFile(join(installedRoot, "package.json"), "utf8"));
  assert.equal(installedManifest.name, manifest.name);
  assert.equal(installedManifest.version, manifest.version);
  assert.deepEqual(installedManifest.bin, { flashlearn: "dist/index.js" });
  const entrypoint = join(installedRoot, "dist/index.js");
  // Verify the npm-created shim separately, then exercise project paths through
  // Node without a shell so Windows spaces are not interpreted as separators.
  assert.match(run(npmCommand, ["exec", "--offline", "--", "flashlearn", "--help"], { cwd: temp, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), /Usage: flashlearn/);
  function cli(args) {
    return run(process.execPath, [entrypoint, ...args], { cwd: temp, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }
  assert.equal(cli(["--version"]).trim(), manifest.version);
  assert.match(cli(["--help"]), /Usage: flashlearn/);
  const project = join(temp, "sample project");
  await mkdir(project);
  await writeFile(join(project, "README.md"), "# Request routing\nThe router matches incoming HTTP paths and dispatches each request to the registered service handler.\n");
  // Git identity is supplied per command, never persisted to repository config.
  run("git", ["init", "-q"], { cwd: project, env });
  run("git", ["add", "README.md"], { cwd: project, env });
  run("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "sample"], { cwd: project, env });
  cli(["init", project]);
  cli(["generate", project]);
  const cards = JSON.parse(cli(["question", "list", "--project", project, "-o", "json"]));
  assert(cards.length > 0);
  assert.equal(cards[0].source.path, "README.md");
  assert.match(cards[0].source.sha, /^[a-f0-9]{40}$/);
  assert.equal(JSON.parse(cli(["question", "get", cards[0].id, "--project", project, "-o", "json"])).id, cards[0].id);
  const probe = createServer();
  await new Promise((done) => probe.listen(0, "127.0.0.1", done));
  const port = probe.address().port;
  await new Promise((done) => probe.close(done));
  server = spawn(process.execPath, [entrypoint, "start", project, "--host", "127.0.0.1", "--port", String(port)], { cwd: temp, env, stdio: ["ignore", "pipe", "pipe"] });
  const base = `http://127.0.0.1:${port}`;
  let response;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Installed server exited before startup");
    try { response = await fetch(base); if (response.ok) break; } catch {}
    await new Promise((done) => setTimeout(done, 100));
  }
  assert(response?.ok, "installed server did not start");
  const html = await response.text();
  assert(html.includes('id="root"'));
  for (const [, asset] of html.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g)) assert((await fetch(base + asset)).ok, asset);
  assert((await fetch(base + "/flashlearn-icon.png")).ok);
  const preview = await (await fetch(base + "/api/cards/next")).json();
  assert(!("answer" in preview));
  assert.equal((await (await fetch(base + "/api/cards/" + preview.id)).json()).answer, cards[0].answer);
  const review = await fetch(base + "/api/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cardId: preview.id, result: "easy" }) });
  assert.equal(review.status, 200);
  const state = await review.json();
  const stored = JSON.parse(await readFile(join(project, ".flashlearn/review.json"), "utf8"));
  assert.deepEqual(stored[preview.id], state);
  assert.equal(state.reviewCount, 1);
  assert.equal((await fetch(base + "/api/cards/next")).status, 404, "scheduled card must leave the due queue");
  await writeFile(join(ROOT, ".release/tested.json"), JSON.stringify(receipt));
  console.log("Installed tarball passed: executable, version, generation, queries, UI assets, and persisted review");
} finally {
  if (server?.exitCode === null) { server.kill(); await once(server, "exit"); }
  await rm(temp, { recursive: true, force: true });
}
