import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, distTag, npmCommand, releaseManifest, run } from "./release-lib.mjs";
import { validateReleaseEvent, validateTestedArtifact, matchesPublishedArtifact, publishedVersion } from "./release-validation.mjs";

const manifest = await releaseManifest();
validateReleaseEvent(manifest, process.env.GITHUB_EVENT_NAME,
  JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8")), process.env.GITHUB_REF);
const artifact = JSON.parse(await readFile(join(ROOT, ".release/artifact.json"), "utf8"));
const tested = JSON.parse(await readFile(join(ROOT, ".release/tested.json"), "utf8"));
const integrity = validateTestedArtifact(manifest, artifact, tested, await readFile(join(ROOT, ".release/flashlearn.tgz")));
if (matchesPublishedArtifact(manifest, await publishedVersion(manifest), integrity)) {
  console.log(`${manifest.name}@${manifest.version} already contains this exact artifact; skipping publication`);
} else {
  run(npmCommand, ["publish", ".release/flashlearn.tgz", "--access", "public", "--provenance", "--tag", distTag(manifest.version)]);
  let verified = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    if (matchesPublishedArtifact(manifest, await publishedVersion(manifest), integrity)) { verified = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  if (!verified) throw new Error("Published version is not yet visible on npm; rerun this workflow to verify it");
  console.log("Published npm artifact integrity verified");
}
