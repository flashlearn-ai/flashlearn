import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseManifest } from "./release-lib.mjs";
import { validateReleaseEvent } from "./release-validation.mjs";

/** Missing resources are distinct from auth, rate-limit, and network failures. */
function github(args, optional = false) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (optional) {
      try { if (JSON.parse(result.stdout).status === "404") return null; } catch {}
    }
    throw new Error(`GitHub command failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

export async function createRelease({ manifest, sha, ref, repo, gh = github }) {
  if (ref !== "refs/heads/main") throw new Error("Create releases from main only");
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Expected the checked-out commit SHA");
  const tag = `v${manifest.version}`;
  const api = `repos/${repo}`;
  const existingTag = await gh(["api", `${api}/git/ref/tags/${tag}`], true);
  if (existingTag) {
    // The commits API resolves annotated as well as lightweight tags.
    const commit = await gh(["api", `${api}/commits/${tag}`]);
    if (commit.sha !== sha) throw new Error(`${tag} already points to another commit; bump release/package.json for a new release`);
  } else {
    await gh(["api", "--method", "POST", `${api}/git/refs`, "-f", `ref=refs/tags/${tag}`, "-f", `sha=${sha}`]);
  }

  const existingRelease = await gh(["api", `${api}/releases/tags/${tag}`], true);
  if (existingRelease) {
    validateReleaseEvent(manifest, "release", { action: "published", release: existingRelease }, `refs/tags/${tag}`);
  } else {
    // POST directly so the response is JSON and the tag is already pinned.
    await gh(["api", "--method", "POST", `${api}/releases`,
      "-f", `tag_name=${tag}`, "-f", `name=${tag}`, "-F", "generate_release_notes=true",
      "-F", `prerelease=${manifest.version.includes("-")}`, "-F", "draft=false"]);
  }

  // GITHUB_TOKEN-created releases do not emit a downstream release workflow run.
  // Explicit workflow_dispatch is supported and keeps publish.yml as the OIDC publisher.
  await gh(["api", "--method", "POST", `${api}/actions/workflows/publish.yml/dispatches`,
    "-f", "ref=main", "-f", `inputs[tag]=${tag}`]);
  return tag;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (sha !== process.env.GITHUB_SHA) throw new Error("Checkout does not match the workflow commit");
  const tag = await createRelease({
    manifest: await releaseManifest(), sha, ref: process.env.GITHUB_REF, repo: process.env.GH_REPO,
  });
  console.log(`Release ${tag} is ready; dispatched publish.yml for npm publication and release assets.`);
}
