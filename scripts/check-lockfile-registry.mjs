import { readFile } from "node:fs/promises";

// A lockfile records where each package was fetched from. Running `npm install`
// behind a private mirror rewrites those URLs to the mirror and replaces the
// published sha512 integrity with a weaker hash, which then ships in a public
// repository: it names internal infrastructure and ties every contributor's
// install to a feed most of them cannot reach.
const PUBLIC_REGISTRY = "registry.npmjs.org";

const lockfile = JSON.parse(await readFile("package-lock.json", "utf8"));
const problems = [];

// Refuse to report on a shape this does not understand. A guard that prints a
// success line for a file it never inspected is worse than no guard: the next
// person to hit this trusts a green check that examined nothing.
if (lockfile.lockfileVersion < 2 || typeof lockfile.packages !== "object") {
  console.error(`package-lock.json is version ${lockfile.lockfileVersion}, which this check cannot read.`);
  console.error("Regenerate it with npm 7 or newer so every package is listed under `packages`.");
  process.exit(1);
}

/** The host a spec points at, or null when it names no remote. */
function remoteHost(resolved) {
  if (typeof resolved !== "string") return null;
  // Workspace links resolve to a relative path rather than a URL.
  if (!/^(https?|git\+[a-z]+):/.test(resolved)) return null;
  try {
    return new URL(resolved.replace(/^git\+/, "")).host;
  } catch {
    return resolved;
  }
}

let registryEntries = 0;

for (const [name, entry] of Object.entries(lockfile.packages)) {
  const where = name || "(root)";
  const host = remoteHost(entry.resolved);
  if (host === null) continue;

  if (host !== PUBLIC_REGISTRY) {
    problems.push(`${where}: resolved from ${host}`);
    continue;
  }

  registryEntries += 1;
  // Stated as a requirement rather than a list of rejected algorithms: a missing
  // integrity is a worse outcome than a weak one, and both passed before.
  if (typeof entry.integrity !== "string" || !entry.integrity.startsWith("sha512-")) {
    problems.push(`${where}: integrity is ${entry.integrity ?? "absent"}, not the published sha512`);
  }
}

if (problems.length) {
  console.error("package-lock.json does not point at the public npm registry:");
  console.error(problems.map((problem) => `- ${problem}`).join("\n"));
  console.error("\nRegenerate it on a network that can reach registry.npmjs.org:");
  console.error("  rm package-lock.json && npm install --package-lock-only --registry=https://registry.npmjs.org");
  process.exit(1);
}

console.log(`Lockfile resolves ${registryEntries} packages from the public registry`);
