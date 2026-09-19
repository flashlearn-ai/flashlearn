import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, npmCommand, run } from "./release-lib.mjs";

async function digest(root) {
  const hash = createHash("sha256");
  async function visit(dir) {
    for (const item of (await readdir(dir, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      const path = join(dir, item.name);
      hash.update(item.name);
      if (item.isDirectory()) await visit(path); else hash.update(await readFile(path));
    }
  }
  await visit(root);
  return hash.digest("hex");
}

const liveRoot = join(ROOT, "packages/frontend/client/dist");
const demoRoot = join(ROOT, "packages/frontend/client/dist-demo");
run(npmCommand, ["run", "build", "--workspace", "@flashlearn/frontend"], { env: { ...process.env, VITE_DECK_SOURCE: "fixture" } });
const live = await digest(liveRoot);
run(npmCommand, ["run", "demo", "--workspace", "@flashlearn/frontend"], { env: { ...process.env, VITE_DECK_SOURCE: "https://invalid.example/private-deck" } });
assert.equal(await digest(liveRoot), live, "demo overwrote live output");
const demo = await digest(demoRoot);
run(npmCommand, ["run", "build", "--workspace", "@flashlearn/frontend"]);
assert.equal(await digest(demoRoot), demo, "live overwrote demo output");
assert.equal(await digest(liveRoot), live, "live release inherited fixture override");

/* The sample deck is a fixture. A project running `flashlearn start` serves the
 * live bundle, which must not carry cards that project did not generate — even
 * unreachable ones. It is imported on demand, so it belongs in its own chunk. */
const assets = await readdir(join(liveRoot, "assets"));
for (const name of assets) {
  const asset = await readFile(join(liveRoot, "assets", name), "utf8");
  for (const sample of ["packages/cli, the composition root", "SESSION_LIMIT, currently 12"]) {
    assert(!asset.includes(sample), `live build asset ${name} contains sample deck text: ${sample}`);
  }
}
console.log("Live and demo build isolation passed in both orders");
