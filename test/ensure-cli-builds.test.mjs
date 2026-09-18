import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { ensureCliBuilds } from "../scripts/ensure-cli-builds.mjs";

async function put(root, path, contents) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), contents);
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-build-cache-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packages = ["frontend", "storage"];
  for (const name of packages) await put(root, `packages/${name}/src/index.ts`, "source");
  await put(root, "packages/frontend/client/index.html", "html");
  await put(root, "packages/frontend/client/src/App.tsx", "client source");
  const calls = [];
  const runBuild = async (_, name) => {
    calls.push(name);
    for (const path of ["index.js", "index.d.ts", "service.js"]) {
      await put(root, `packages/${name}/dist/${path}`, "server output");
    }
    if (name === "frontend") {
      for (const path of ["index.html", "assets/chunk.js", "assets/style.css"]) {
        await put(root, `packages/${name}/client/dist/${path}`, "client output");
      }
    }
  };
  return { root, calls, runBuild, options: { root, packages, runBuild } };
}

test("warm CLI calls reuse builds; changed and deleted inputs invalidate only their package", async (t) => {
  const { root, calls, options } = await fixture(t);
  assert.deepEqual(await ensureCliBuilds(options), ["frontend", "storage"]);
  assert.deepEqual(await ensureCliBuilds(options), []);
  assert.deepEqual(calls, ["frontend", "storage"]);
  await put(root, "packages/frontend/client/src/App.tsx", "updated client source");
  assert.deepEqual(await ensureCliBuilds(options), ["frontend"]);
  await rm(join(root, "packages/storage/src/index.ts"));
  assert.deepEqual(await ensureCliBuilds(options), ["storage"]);
  assert.deepEqual(await ensureCliBuilds(options), []);
});

test("missing live client directory, shell, and assets rebuild the frontend", async (t) => {
  const { root, options } = await fixture(t);
  await ensureCliBuilds(options);
  for (const path of ["client/dist", "client/dist/index.html", "client/dist/assets/chunk.js", "client/dist/assets/style.css"]) {
    await rm(join(root, "packages/frontend", path), { recursive: true });
    assert.deepEqual(await ensureCliBuilds(options), ["frontend"], path);
    assert.deepEqual(await ensureCliBuilds(options), [], path);
  }
});

test("tampered live client and compiled server outputs rebuild their package", async (t) => {
  const { root, options } = await fixture(t);
  await ensureCliBuilds(options);
  for (const path of ["client/dist/index.html", "client/dist/assets/chunk.js", "client/dist/assets/style.css", "dist/index.js", "dist/index.d.ts", "dist/service.js"]) {
    await put(root, `packages/frontend/${path}`, "tampered output");
    assert.deepEqual(await ensureCliBuilds(options), ["frontend"], path);
    assert.deepEqual(await ensureCliBuilds(options), [], path);
  }
  await put(root, "packages/storage/dist/index.js", "stale output");
  assert.deepEqual(await ensureCliBuilds(options), ["storage"]);
});

test("generated demo and browser outputs, including inside fixtures, do not invalidate builds", async (t) => {
  const { root, options } = await fixture(t);
  await ensureCliBuilds(options);
  const paths = [
    "client/dist-demo/index.html", "client/dist-demo/assets/demo.js",
    "test-results/results.json", "playwright-report/index.html", "shots/ui.png", "coverage/results.json",
    "test/fixtures/browser/client/dist/index.html", "test/fixtures/browser/client/dist-demo/index.html",
    "test/fixtures/browser/test-results/results.json",
  ];
  for (const contents of ["generated", "regenerated"]) {
    for (const path of paths) await put(root, `packages/frontend/${path}`, contents);
    assert.deepEqual(await ensureCliBuilds(options), []);
  }
  await rm(join(root, "packages/frontend/client/dist-demo"), { recursive: true });
  assert.deepEqual(await ensureCliBuilds(options), []);
  // Hand-authored fixtures are still inputs, even though their build outputs are not.
  await put(root, "packages/frontend/test/fixtures/browser/src/index.ts", "fixture source");
  assert.deepEqual(await ensureCliBuilds(options), ["frontend"]);
});

test("shared dependency, configuration, and contract changes rebuild every package", async (t) => {
  const { root, options } = await fixture(t);
  await ensureCliBuilds(options);
  for (const path of ["package.json", "package-lock.json", "tsconfig.base.json", "contracts/index.d.ts"]) {
    await put(root, path, "changed shared input");
    assert.deepEqual(await ensureCliBuilds(options), ["frontend", "storage"], path);
  }
});

test("failed builds are not cached", async (t) => {
  const { root, options } = await fixture(t);
  await ensureCliBuilds(options);
  await put(root, "packages/storage/src/index.ts", "broken");
  await assert.rejects(() => ensureCliBuilds({ ...options, runBuild: () => { throw new Error("compile failed"); } }), /compile failed/);
  assert.deepEqual(await ensureCliBuilds(options), ["storage"]);
});

test("a build without the live client shell is not cached", async (t) => {
  const { root, runBuild, options } = await fixture(t);
  await assert.rejects(() => ensureCliBuilds({ ...options, runBuild: async (...args) => {
    await runBuild(...args);
    await rm(join(root, "packages/frontend/client/dist"), { recursive: true });
  } }), /did not produce required outputs/);
  await assert.rejects(readFile(join(root, "node_modules/.cache/flashlearn/frontend.json")), { code: "ENOENT" });
  assert.deepEqual(await ensureCliBuilds(options), ["frontend", "storage"]);
});

test("inputs changed during a build are not certified", async (t) => {
  const { root, runBuild, options } = await fixture(t);
  await assert.rejects(() => ensureCliBuilds({ ...options, runBuild: async (...args) => {
    await runBuild(...args);
    await put(root, "packages/frontend/client/src/App.tsx", "edited during build");
  } }), /Inputs changed during/);
  assert.deepEqual(await ensureCliBuilds(options), ["frontend", "storage"]);
});

test("invalid cache metadata rebuilds instead of blocking the CLI", async (t) => {
  const { root, options } = await fixture(t);
  await ensureCliBuilds(options);
  await put(root, "node_modules/.cache/flashlearn/frontend.json", "{broken json");
  assert.deepEqual(await ensureCliBuilds(options), ["frontend"]);
});

test("real child build stdout and stderr go to stderr; warm runs stay silent", async (t) => {
  const { root } = await fixture(t);
  await put(root, "package.json", JSON.stringify({ private: true, workspaces: ["packages/*"] }));
  await put(root, "packages/storage/package.json", JSON.stringify({
    name: "@flashlearn/storage", scripts: { build: "node build.mjs" },
  }));
  await put(root, "packages/storage/build.mjs", `
    import { mkdirSync, writeFileSync } from "node:fs";
    console.log("child stdout");
    console.error("child stderr");
    mkdirSync("dist", { recursive: true });
    writeFileSync("dist/index.js", "output");
    writeFileSync("dist/index.d.ts", "types");
  `);
  const script = new URL("../scripts/ensure-cli-builds.mjs", import.meta.url).href;
  const run = () => spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { ensureCliBuilds } from ${JSON.stringify(script)};
    await ensureCliBuilds({ root: ${JSON.stringify(root)}, packages: ["storage"] });
  `], { cwd: root, encoding: "utf8" });
  const cold = run();
  assert.equal(cold.status, 0, cold.stderr);
  assert.equal(cold.stdout, "");
  assert.match(cold.stderr, /Building @flashlearn\/storage/);
  assert.match(cold.stderr, /child stdout/);
  assert.match(cold.stderr, /child stderr/);
  const warm = run();
  assert.equal(warm.status, 0, warm.stderr);
  assert.equal(warm.stdout, "");
  assert.equal(warm.stderr, "");
});
