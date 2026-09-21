import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, distTag, npmCommand, releaseManifest, run } from "./release-lib.mjs";
import { validateTestedArtifact, matchesPublishedArtifact, publishedVersion, waitForPublishedArtifact } from "./release-validation.mjs";
import { checkReleaseContext } from "./release-context.mjs";

const root = process.env.FLASHLEARN_RELEASE_ROOT ?? ROOT;
const manifest = await releaseManifest(root);
await checkReleaseContext(manifest);
const artifact = JSON.parse(await readFile(join(root, ".release/artifact.json"), "utf8"));
const tested = JSON.parse(await readFile(join(root, ".release/tested.json"), "utf8"));
const integrity = validateTestedArtifact(manifest, artifact, tested, await readFile(join(root, ".release/flashlearn.tgz")));
if (matchesPublishedArtifact(manifest, await publishedVersion(manifest), integrity)) {
  console.log(`${manifest.name}@${manifest.version} already contains this exact artifact; skipping publication`);
} else {
  run(npmCommand, ["publish", ".release/flashlearn.tgz", "--access", "public", "--provenance", "--tag", distTag(manifest.version)], { cwd: root });
  await waitForPublishedArtifact(manifest, integrity);
  console.log("Published npm artifact integrity verified");
}
