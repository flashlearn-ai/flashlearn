import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("root package can expose the published CLI through npm link", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(manifest.name, "@flashlearnai/cli");
  assert.equal(manifest.version, "0.2.0");
  assert.equal(manifest.bin?.flashlearn, "scripts/flashlearn.mjs");
  assert.match(await readFile(new URL("../scripts/flashlearn.mjs", import.meta.url), "utf8"), /^#!\/usr\/bin\/env node/);
});
