import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, npmCommand, run } from "./release-lib.mjs";

run(process.execPath, ["scripts/build-release.mjs"]);
const destination = join(ROOT, ".release");
await mkdir(destination, { recursive: true });
const packed = JSON.parse(run(npmCommand, ["pack", "./.release/npm", "--pack-destination", destination, "--json"], { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" }))[0];
for (const file of packed.files) {
  if (!/^(package\.json|README\.md|LICENSE|THIRD_PARTY_NOTICES\.txt|dist\/index\.js|client\/dist\/.*)$/.test(file.path)) throw new Error(`Unexpected published file: ${file.path}`);
  if (file.path.includes(".flashlearn") || file.path.endsWith(".map")) throw new Error(`Unexpected private/debug artifact: ${file.path}`);
}
const source = join(destination, packed.filename);
const bytes = await readFile(source);
await writeFile(join(destination, "flashlearn.tgz"), bytes);
await writeFile(join(destination, "artifact.json"), JSON.stringify({ name: packed.name, version: packed.version,
  sha256: createHash("sha256").update(bytes).digest("hex") }, null, 2));
console.log(`Packed .release/flashlearn.tgz (${packed.files.length} files)`);
