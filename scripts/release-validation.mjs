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

export class RegistryLookupError extends Error {
  constructor(message, retryable, options) {
    super(message, options);
    this.retryable = retryable;
  }
}

export async function publishedVersion(manifest, fetchImpl = fetch, timeoutMs = 30_000) {
  let response;
  try {
    response = await fetchImpl(`https://registry.npmjs.org/${encodeURIComponent(manifest.name)}/${encodeURIComponent(manifest.version)}`, {
      headers: { accept: "application/json", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new RegistryLookupError(`npm registry lookup failed: ${error.message}`, true, { cause: error });
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new RegistryLookupError(`npm registry lookup failed: HTTP ${response.status}`,
    response.status === 408 || response.status === 429 || response.status >= 500);
  try {
    return await response.json();
  } catch (error) {
    // Interrupted response bodies and malformed gateway replies may be transient.
    throw new RegistryLookupError("npm registry lookup failed: unreadable JSON response", true, { cause: error });
  }
}

/** npm may accept a publish before its public registry has finished processing it. */
export async function waitForPublishedArtifact(manifest, integrity, {
  timeoutMs = 5 * 60_000,
  intervalMs = 10_000,
  lookup = (value, budget) => publishedVersion(value, fetch, Math.min(30_000, budget)),
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log,
} = {}) {
  const started = now();
  const deadline = started + timeoutMs;
  let attempt = 0;
  let reason = "version not visible yet";
  log(`Waiting up to ${timeoutMs / 1000}s for npm to process ${manifest.name}@${manifest.version} and expose its integrity…`);
  while (now() < deadline) {
    attempt += 1;
    let metadata;
    try {
      metadata = await lookup(manifest, Math.max(1, deadline - now()));
      reason = "version not visible yet (404)";
    } catch (error) {
      if (!(error instanceof RegistryLookupError) || !error.retryable) throw error;
      reason = error.message;
    }
    // Never retry an artifact mismatch, and never re-publish while polling.
    if (metadata !== undefined && matchesPublishedArtifact(manifest, metadata, integrity)) return;
    const remaining = deadline - now();
    log(`npm verification attempt ${attempt}: ${reason}; ${Math.round((now() - started) / 1000)}s elapsed, ${Math.max(0, Math.ceil(remaining / 1000))}s remaining.`);
    if (remaining > 0) await sleep(Math.min(intervalMs, remaining));
  }
  throw new Error(`npm accepted publication, but ${manifest.name}@${manifest.version} could not be verified within ${timeoutMs / 1000}s (${reason}). Re-run the workflow to verify the existing artifact; do not bump the version just for propagation delay.`);
}
