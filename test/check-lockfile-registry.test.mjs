import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const script = fileURLToPath(new URL("../scripts/check-lockfile-registry.mjs", import.meta.url));

/** Runs the guard against a lockfile written into a scratch directory. */
async function check(lockfile) {
  const cwd = await mkdtemp(join(tmpdir(), "flashlearn-lockfile-"));
  try {
    await writeFile(join(cwd, "package-lock.json"), JSON.stringify(lockfile, null, 2));
    await exec(process.execPath, [script], { cwd });
    return { ok: true, output: "" };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

const good = { resolved: "https://registry.npmjs.org/react/-/react-18.3.1.tgz", integrity: "sha512-abc" };

test("a lockfile resolving from the public registry passes", async () => {
  const result = await check({ packages: { "": {}, "node_modules/react": good, "packages/cli": { link: true, resolved: "packages/cli" } } });
  assert.ok(result.ok, result.output);
});

/** The failure this exists for: an install behind a private mirror rewrites the
 *  lockfile, and the mirror's hostname then ships in a public repository. */
test("a mirror hostname is rejected and named", async () => {
  const mirrored = { ...good, resolved: "https://ms-feed-25.pkgs.visualstudio.com/1es-public/_packaging/npm-public/npm/registry/react/-/react-18.3.1.tgz" };
  const result = await check({ packages: { "": {}, "node_modules/react": mirrored } });
  assert.equal(result.ok, false, "a mirrored URL should fail the check");
  assert.match(result.output, /ms-feed-25\.pkgs\.visualstudio\.com/);
  assert.match(result.output, /registry\.npmjs\.org/, "the fix should be in the message");
});

test("a mirror's weaker sha1 integrity is rejected", async () => {
  const weak = { ...good, integrity: "sha1-8vu/6ofESiFZDsUVt3iywm2IZuc=" };
  const result = await check({ packages: { "": {}, "node_modules/react": weak } });
  assert.equal(result.ok, false, "sha1 integrity should fail the check");
  assert.match(result.output, /sha1/);
});

test("a workspace link is not mistaken for a registry URL", async () => {
  const result = await check({ packages: { "": {}, "packages/frontend": { link: true, resolved: "packages/frontend" } } });
  assert.ok(result.ok, result.output);
});
