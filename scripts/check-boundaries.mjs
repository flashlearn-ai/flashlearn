import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const packageNames = ["cli", "extraction", "storage", "learning", "frontend"];
const violations = [];

async function TypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return (await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? TypeScriptFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  }))).flat();
}

for (const owner of packageNames) {
  const files = (await Promise.all(["src", "ui"].map((directory) => TypeScriptFiles(join("packages", owner, directory))))).flat();
  for (const path of files) {
    const source = await readFile(path, "utf8");
    for (const dependency of packageNames) {
      if (dependency === owner) continue;
      const importsDependency = source.includes(`@flashlearn/${dependency}`)
        || source.includes(`/packages/${dependency}`)
        || source.includes(`../${dependency}/`);
      if (importsDependency && owner !== "cli") violations.push(`${path} imports ${dependency}`);
    }
  }
}

if (violations.length) {
  console.error("Package boundary violations:\n" + violations.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log("Package boundaries are valid");
