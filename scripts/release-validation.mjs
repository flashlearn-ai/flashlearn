import { createHash } from "node:crypto";

export function validateReleaseEvent(manifest, eventName, event, ref) {
  const tag = `v${manifest.version}`;
  if (eventName !== "release" || event?.action !== "published" || event.release?.draft !== false) {
    throw new Error("Publishing requires a published GitHub Release");
  }
  if (event.release.tag_name !== tag || ref !== `refs/tags/${tag}`) {
    throw new Error("Release tag must match release/package.json version");
  }
  if (event.release.prerelease !== manifest.version.includes("-")) {
    throw new Error("GitHub prerelease flag must match the version suffix");
  }
}

export function validateTestedArtifact(manifest, artifact, tested, bytes) {
  const digest = createHash("sha256").update(bytes).digest("hex");
  for (const receipt of [artifact, tested]) {
    if (receipt.name !== manifest.name || receipt.version !== manifest.version || receipt.sha256 !== digest) {
      throw new Error("Artifact is not the tested release");
    }
  }
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

export function matchesPublishedArtifact(manifest, metadata, integrity) {
  if (metadata === null) return false;
  if (metadata.name !== manifest.name || metadata.version !== manifest.version || metadata.dist?.integrity !== integrity) {
    throw new Error("This npm version already exists with different bytes; release a new version");
  }
  return true;
}

export async function publishedVersion(manifest, fetchImpl = fetch) {
  const response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${encodeURIComponent(manifest.version)}`, {
    headers: { accept: "application/json", "cache-control": "no-cache" },
    signal: AbortSignal.timeout(30_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`npm registry lookup failed: HTTP ${response.status}`);
  return response.json();
}
