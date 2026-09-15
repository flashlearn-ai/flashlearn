import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

/**
 * Blocks generated cards, ingested repository content, and credentials from
 * entering the repository. `.gitignore` alone is not a gate: it is bypassed by
 * `git add -f`, and it does not describe files placed outside ignored paths.
 *
 * Usage:
 *   node scripts/check-generated-content.mjs            # staged files
 *   node scripts/check-generated-content.mjs <base> <head>
 */

const MAX_BYTES = 2_000_000;

/** Paths that must never appear in a commit, whatever they contain. */
const FORBIDDEN_PATHS = [
  { pattern: /(^|\/)\.flashlearn\//, reason: "FlashLearn runtime state (generated cards and review data)" },
  { pattern: /(^|\/)knowledge\//, reason: "locally ingested repository content" },
  { pattern: /(^|\/)cards\.json$/, reason: "generated card output" },
  { pattern: /(^|\/)review\.json$/, reason: "local review state" },
  { pattern: /(^|\/)\.env(\.|$)/, reason: "environment file that may hold credentials" },
  { pattern: /\.(pem|key|p12|pfx)$/, reason: "private key material" },
  { pattern: /(^|\/)(secrets|credentials)\./, reason: "credential file" },
];

/**
 * Allow fixtures and examples that are deliberately checked in. The gate's own
 * tests must contain the patterns it detects, so they are exempt by path.
 */
const ALLOWED_PATHS = [
  /(^|\/)\.env\.example$/,
  /(^|\/)test\/fixtures\//,
  /(^|\/)test\/check-generated-content\.test\.mjs$/,
];

/**
 * Content signatures. Generated cards carry attribution fields the contract
 * requires, which makes them recognizable even under an unexpected filename.
 */
const CONTENT_RULES = [
  {
    name: "generated FlashLearn cards",
    test: (text) =>
      /"question"\s*:/.test(text) && /"answer"\s*:/.test(text) && /"sha"\s*:/.test(text) && /"path"\s*:/.test(text),
  },
  {
    name: "endpoint credential",
    test: (text) => /FLASHLEARN_ENDPOINT_API_KEY\s*=\s*\S+/.test(text),
  },
  {
    name: "private key block",
    test: (text) => /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/.test(text),
  },
  {
    name: "GitHub token",
    test: (text) => /\bgh[pousr]_[A-Za-z0-9]{36,}\b/.test(text),
  },
  {
    name: "Azure OpenAI key assignment",
    test: (text) => /\bapi[-_]?key\s*[:=]\s*["']?[A-Za-z0-9]{32,}["']?/i.test(text),
  },
];

function changedFiles(base, head) {
  const args = base && head
    ? ["diff", "--name-only", "--diff-filter=ACMR", `${base}...${head}`]
    : ["diff", "--cached", "--name-only", "--diff-filter=ACMR"];
  return execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);
}

function fileContents(path, base, head) {
  // Read from the commit when comparing refs; the working tree may differ.
  if (base && head) {
    try {
      return execFileSync("git", ["show", `${head}:${path}`], { encoding: "utf8", maxBuffer: MAX_BYTES });
    } catch {
      return null;
    }
  }
  try {
    if (statSync(path).size > MAX_BYTES) return null;
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

const [base, head] = process.argv.slice(2);
if ((base && !head) || (!base && head)) {
  console.error("Usage: node scripts/check-generated-content.mjs [<base-ref> <head-ref>]");
  process.exit(2);
}

let files;
try {
  files = changedFiles(base, head);
} catch {
  console.error(base ? `Unable to compare ${base} with ${head}` : "Unable to read staged files");
  process.exit(2);
}

const violations = [];

for (const path of files) {
  if (ALLOWED_PATHS.some((pattern) => pattern.test(path))) continue;

  const forbidden = FORBIDDEN_PATHS.find((rule) => rule.pattern.test(path));
  if (forbidden) {
    violations.push(`${path}: ${forbidden.reason}`);
    continue;
  }

  const contents = fileContents(path, base, head);
  if (contents === null) continue;

  for (const rule of CONTENT_RULES) {
    if (rule.test(contents)) {
      violations.push(`${path}: looks like ${rule.name}`);
      break;
    }
  }
}

if (violations.length > 0) {
  console.error("Generated or confidential content must not be committed:");
  console.error(violations.map((item) => `- ${item}`).join("\n"));
  console.error("");
  console.error("Generated cards and ingested repository content stay local.");
  console.error("If a match is a legitimate fixture, place it under test/fixtures/.");
  process.exit(1);
}

console.log(`No generated or confidential content in ${files.length} changed file(s)`);
