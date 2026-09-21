import { execFileSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Resolve retries to real published release metadata, never user-supplied flags. */
export function publishedReleaseContext(tag, release) {
  if (typeof tag !== "string" || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error("Select an existing version tag such as v0.2.0");
  }
  if (release?.tag_name !== tag || release.draft !== false || !release.published_at
    || typeof release.prerelease !== "boolean") {
    throw new Error("The tag must identify an existing published GitHub Release");
  }
  return { action: "published", release };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tag = process.env.RELEASE_TAG;
  // Validate before constructing a URL or writing workflow outputs.
  if (!tag || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
    throw new Error("Select an existing version tag such as v0.2.0");
  }
  const release = JSON.parse(execFileSync("gh", [
    "api", `repos/${process.env.GH_REPO}/releases/tags/${encodeURIComponent(tag)}`,
  ], { encoding: "utf8" }));
  const event = publishedReleaseContext(tag, release);
  await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\nevent=${JSON.stringify(event)}\n`);
}
