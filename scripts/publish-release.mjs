import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, distTag, npmCommand, releaseManifest, run } from "./release-lib.mjs";

const manifest = await releaseManifest();
if (process.env.GITHUB_REF !== `refs/tags/v${manifest.version}`) throw new Error("Tag must match release/package.json version");
const artifact = JSON.parse(await readFile(join(ROOT, ".release/artifact.json"), "utf8"));
const tested = JSON.parse(await readFile(join(ROOT, ".release/tested.json"), "utf8"));
const digest = createHash("sha256").update(await readFile(join(ROOT, ".release/flashlearn.tgz"))).digest("hex");
if (artifact.version !== manifest.version || tested.sha256 !== digest || artifact.sha256 !== digest) throw new Error("Artifact is not the tested release");
run(npmCommand, ["publish", ".release/flashlearn.tgz", "--access", "public", "--provenance", "--tag", distTag(manifest.version)]);
