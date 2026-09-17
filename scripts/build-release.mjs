import { build } from "esbuild";
import { builtinModules } from "node:module";
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, npmCommand, releaseManifest, run } from "./release-lib.mjs";

const manifest = await releaseManifest();
// Workspace package exports resolve through dist; the live UI must be built too.
run(npmCommand, ["run", "build"]);
const stage = join(ROOT, ".release/npm");
await rm(stage, { recursive: true, force: true });
await mkdir(join(stage, "dist"), { recursive: true });
await writeFile(join(stage, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await cp(join(ROOT, "release/README.md"), join(stage, "README.md"));
await cp(join(ROOT, "LICENSE"), join(stage, "LICENSE"));
await cp(join(ROOT, "packages/frontend/client/dist"), join(stage, "client/dist"), { recursive: true });
const result = await build({
  absWorkingDir: ROOT, entryPoints: ["release/index.mjs"], outfile: join(stage, "dist/index.js"),
  bundle: true, platform: "node", format: "esm", target: "node22", metafile: true,
});
const builtins = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);
for (const output of Object.values(result.metafile.outputs)) {
  for (const imported of output.imports) {
    if (imported.external && !builtins.has(imported.path)) throw new Error(`Unbundled runtime dependency: ${imported.path}`);
  }
}
await chmod(join(stage, "dist/index.js"), 0o755);
// React is shipped inside the browser assets; carry its upstream notices.
const notices = await Promise.all(["react", "react-dom", "scheduler"].map(async (name) =>
  `${name}\n${await readFile(join(ROOT, "node_modules", name, "LICENSE"), "utf8")}`));
await writeFile(join(stage, "THIRD_PARTY_NOTICES.txt"), notices.join("\n\n---\n\n"));
console.log(`Staged ${manifest.name}@${manifest.version} in .release/npm`);
