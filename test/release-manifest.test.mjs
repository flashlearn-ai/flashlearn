import assert from "node:assert/strict";
import test from "node:test";
import { distTag, releaseManifest, validateManifest } from "../scripts/release-lib.mjs";

test("public manifest is standalone and maps prereleases to next", async () => {
  const manifest = await releaseManifest();
  assert.equal(manifest.name, "@flashlearnai/cli");
  assert.equal(manifest.homepage, "https://flashlearn-ai.github.io/flashlearn/");
  assert.equal(manifest.license, "MIT");
  assert.deepEqual(manifest.bin, { flashlearn: "dist/index.js" });
  assert.throws(() => validateManifest({ ...manifest, name: "flashlearn" }), /standalone/);
  assert.equal(distTag("0.1.0-next.0"), "next");
  assert.equal(distTag("0.1.0"), "latest");
  assert.throws(() => validateManifest({ ...manifest, dependencies: { "@flashlearn/cli": "0.0.0" } }), /standalone/);
  assert.throws(() => validateManifest({ ...manifest, version: "invalid" }), /version/);
});
