import { execFileSync } from "node:child_process";

const [base, head] = process.argv.slice(2);

if (!base || !head) {
  console.error("Usage: node scripts/check-package-scope.mjs <base-ref> <head-ref>");
  process.exit(2);
}

let output;
try {
  output = execFileSync("git", ["diff", "--name-only", base, head, "--", "packages"], {
    encoding: "utf8",
  });
} catch {
  console.error(`Unable to compare ${base} with ${head}`);
  process.exit(2);
}

const changedFiles = output.split("\n").filter(Boolean);
const changedPackages = [...new Set(changedFiles.map((path) => path.split("/")[1]).filter(Boolean))].sort();

if (changedPackages.length > 1) {
  console.error("Changes may edit only one package per pull request.");
  console.error(`Changed packages: ${changedPackages.join(", ")}`);
  console.error(changedFiles.map((path) => `- ${path}`).join("\n"));
  process.exit(1);
}

console.log(changedPackages.length === 1
  ? `Package scope is valid: ${changedPackages[0]}`
  : "Package scope is valid: no package changes");
