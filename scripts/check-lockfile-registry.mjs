import { readFile } from "node:fs/promises";

// A lockfile records where each package was fetched from. Running `npm install`
// behind a private mirror rewrites those URLs to the mirror and downgrades the
// integrity hash, which then ships in a public repository: it names internal
// infrastructure and ties every contributor's install to a feed most of them
// cannot reach. Keep the public registry in the lockfile regardless of who runs
// the install.
const PUBLIC_REGISTRY = "https://registry.npmjs.org/";

const lockfile = JSON.parse(await readFile("package-lock.json", "utf8"));
const problems = [];

for (const [name, entry] of Object.entries(lockfile.packages ?? {})) {
  const where = name || "(root)";
  // Workspace links resolve to a relative path rather than a registry URL.
  const remote = typeof entry.resolved === "string" && /^https?:/.test(entry.resolved);
  if (remote && !entry.resolved.startsWith(PUBLIC_REGISTRY)) {
    problems.push(`${where}: resolved from ${new URL(entry.resolved).host}`);
  }
  if (typeof entry.integrity === "string" && entry.integrity.startsWith("sha1-")) {
    problems.push(`${where}: sha1 integrity, which a mirror substitutes for the published sha512`);
  }
}

if (problems.length) {
  console.error("package-lock.json does not point at the public npm registry:");
  console.error(problems.map((problem) => `- ${problem}`).join("\n"));
  console.error("\nRegenerate it on a network that can reach registry.npmjs.org:");
  console.error("  rm package-lock.json && npm install --package-lock-only --registry=https://registry.npmjs.org");
  process.exit(1);
}

console.log(`Lockfile resolves ${Object.keys(lockfile.packages ?? {}).length} packages from the public registry`);
