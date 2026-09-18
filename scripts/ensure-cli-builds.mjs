import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACKAGES = ["extraction", "frontend", "learning", "storage"];
const SHARED = ["package.json", "package-lock.json", "tsconfig.base.json", "contracts"];
const IGNORED = new Set(["dist", "dist-demo", "node_modules", ".git", ".flashlearn", "test-results", "playwright-report", "shots", "coverage"]);

async function fingerprint(root, paths, ignored = new Set()) {
  const hash = createHash("sha256");
  async function visit(path) {
    let entries;
    try { entries = await readdir(join(root, path), { withFileTypes: true }); }
    catch (error) {
      if (error.code === "ENOENT") { hash.update(`missing:${path}\0`); return; }
      if (error.code !== "ENOTDIR") throw error;
      hash.update(`file:${path}\0`).update(await readFile(join(root, path))).update("\0");
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!ignored.has(entry.name)) await visit(join(path, entry.name));
    }
  }
  for (const path of paths) await visit(path);
  return hash.digest("hex");
}

async function exists(path) {
  try { await readFile(path); return true; }
  catch (error) { if (error.code === "ENOENT") return false; throw error; }
}

function build(root, name) {
  console.error(`Building @flashlearn/${name} (inputs changed or build missing)…`);
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build", "--workspace", `@flashlearn/${name}`, "--silent"], {
    cwd: root, stdio: ["inherit", 2, 2], shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Build failed for @flashlearn/${name}`);
}

export async function ensureCliBuilds({ root = ROOT, packages = PACKAGES, runBuild = build } = {}) {
  const shared = await fingerprint(root, SHARED);
  const rebuilt = [];
  for (const name of packages) {
    const pkg = join("packages", name);
    const cachePath = join(root, "node_modules/.cache/flashlearn", `${name}.json`);
    const inputs = `${process.version}:${process.platform}:${process.arch}:${shared}:${await fingerprint(root, [pkg], IGNORED)}`;
    // The frontend's browser bundle lives beside, rather than inside, its server dist.
    const outputPaths = [join(pkg, "dist")];
    const required = ["dist/index.js", "dist/index.d.ts"];
    if (name === "frontend") {
      outputPaths.push(join(pkg, "client/dist"));
      required.push("client/dist/index.html");
    }
    const outputs = () => fingerprint(root, outputPaths);
    const complete = async () => (await Promise.all(required.map((path) => exists(join(root, pkg, path))))).every(Boolean);
    let cached;
    try { cached = JSON.parse(await readFile(cachePath, "utf8")); }
    catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
    if (cached?.inputs === inputs && await complete() && cached.outputs === await outputs()) continue;

    await runBuild(root, name);
    if (!await complete()) throw new Error(`Build did not produce required outputs for @flashlearn/${name}`);
    // Never certify a build if an editor changed its inputs while it ran.
    const currentShared = await fingerprint(root, SHARED);
    const currentInputs = `${process.version}:${process.platform}:${process.arch}:${currentShared}:${await fingerprint(root, [pkg], IGNORED)}`;
    if (currentInputs !== inputs) throw new Error(`Inputs changed during @flashlearn/${name} build; retry the command`);
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, JSON.stringify({ inputs, outputs: await outputs() }));
    rebuilt.push(name);
  }
  return rebuilt;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureCliBuilds().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
