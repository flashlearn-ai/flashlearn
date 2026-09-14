import assert from "node:assert/strict";
import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

test("init creates the storage files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "flashlearn-cli-"));
  const entrypoint = resolve(import.meta.dirname, "../src/index.ts");
  const tsx = resolve(import.meta.dirname, "../../../node_modules/tsx/dist/cli.mjs");
  const status = await new Promise<number | null>((done) => spawn(process.execPath, [tsx, entrypoint, "init"], { cwd: directory, stdio: "ignore" }).on("close", done));
  assert.equal(status, 0);
  await Promise.all(["cards.json", "review.json", "settings.json"].map((file) => access(join(directory, ".flashlearn", file))));
});
