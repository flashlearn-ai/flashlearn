import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateReleaseContext } from "../scripts/release-context.mjs";
import { releaseManifest } from "../scripts/release-lib.mjs";

const manifest = { version: "0.2.0" };
const release = { action: "published", release: { tag_name: "v0.2.0", draft: false, prerelease: false } };

test("manual validation uses release metadata without changing the real Actions context", () => {
  const env = Object.freeze({ GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main" });
  validateReleaseContext(manifest, env, { inputs: { tag: "v0.2.0" } }, release);
  assert.throws(() => validateReleaseContext(manifest, env, { inputs: { tag: "v0.1.0" } }, release), /matching/);
  assert.throws(() => validateReleaseContext(manifest, env, { inputs: { tag: "v0.2.0" } }), /resolved metadata/);
  for (const patch of [{ draft: true }, { prerelease: true }, { tag_name: "v0.1.0" }]) {
    assert.throws(() => validateReleaseContext(manifest, env, { inputs: { tag: "v0.2.0" } }, {
      ...release, release: { ...release.release, ...patch },
    }));
  }
});

test("release events still validate their original event/ref and unrelated triggers fail", () => {
  validateReleaseContext(manifest, { GITHUB_EVENT_NAME: "release", GITHUB_REF: "refs/tags/v0.2.0" }, release);
  assert.throws(() => validateReleaseContext(manifest, { GITHUB_EVENT_NAME: "release", GITHUB_REF: "refs/heads/main" }, release, release), /tag/);
  assert.throws(() => validateReleaseContext(manifest, { GITHUB_EVENT_NAME: "push" }, release, release), /requires/);
});

test("current publisher uses a separate source root and npm inherits authentic GitHub variables", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "flashlearn-publish-context-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "release"));
  await mkdir(join(root, ".release"));
  const sourceManifest = { ...await releaseManifest(), version: "0.2.0-beta.1" };
  await writeFile(join(root, "release/package.json"), JSON.stringify(sourceManifest));
  const bytes = Buffer.from("fixture artifact");
  const receipt = { name: sourceManifest.name, version: sourceManifest.version, sha256: createHash("sha256").update(bytes).digest("hex") };
  await writeFile(join(root, ".release/flashlearn.tgz"), bytes);
  for (const name of ["artifact", "tested"]) await writeFile(join(root, `.release/${name}.json`), JSON.stringify(receipt));
  const eventPath = join(root, "dispatch.json");
  await writeFile(eventPath, JSON.stringify({ inputs: { tag: "v0.2.0-beta.1" } }));
  const metadata = { ...sourceManifest, dist: { integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` } };
  const preload = join(root, "registry.mjs");
  await writeFile(preload, `let calls = 0; globalThis.fetch = async () => ++calls === 1 ? new Response(null, { status: 404 }) : Response.json(${JSON.stringify(metadata)});`);
  const fakeNpm = join(root, "npm.mjs");
  await writeFile(fakeNpm, `import { writeFileSync } from 'node:fs'; writeFileSync('npm-call.json', JSON.stringify({ cwd: process.cwd(), args: process.argv.slice(2), env: Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith('GITHUB_'))) }));`);
  const github = {
    GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_PATH: eventPath, GITHUB_SHA: "a".repeat(40), GITHUB_WORKFLOW_REF: "example/project/.github/workflows/publish.yml@refs/heads/main",
  };
  execFileSync(process.execPath, ["--import", preload, fileURLToPath(new URL("../scripts/publish-release.mjs", import.meta.url))], {
    env: { ...process.env, ...github, npm_execpath: fakeNpm,
      FLASHLEARN_RELEASE_ROOT: root,
      FLASHLEARN_RELEASE_EVENT: JSON.stringify({ action: "published", release: { tag_name: "v0.2.0-beta.1", draft: false, prerelease: true } }),
    },
  });
  const call = JSON.parse(await readFile(join(root, "npm-call.json"), "utf8"));
  assert.equal(call.cwd, root);
  assert.deepEqual(call.args, ["publish", ".release/flashlearn.tgz", "--access", "public", "--provenance", "--tag", "next"]);
  for (const [key, value] of Object.entries(github)) assert.equal(call.env[key], value, key);
});
