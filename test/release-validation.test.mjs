import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  validateReleaseEvent,
  validateTestedArtifact,
  matchesPublishedArtifact,
  publishedVersion,
  waitForPublishedArtifact,
  PUBLISH_REPLICATION_DELAY_MS,
  PUBLISH_VERIFY_ATTEMPTS,
  PUBLISH_VERIFY_INTERVAL_MS,
} from "../scripts/release-validation.mjs";

const manifest = { name: "@flashlearnai/cli", version: "0.1.0" };
const event = { action: "published", release: { tag_name: "v0.1.0", draft: false, prerelease: false } };

test("only published releases with matching tag, ref and prerelease semantics can publish", () => {
  validateReleaseEvent(manifest, "release", event, "refs/tags/v0.1.0");
  validateReleaseEvent({ ...manifest, version: "0.2.0-beta.0" }, "release",
    { ...event, release: { ...event.release, tag_name: "v0.2.0-beta.0", prerelease: true } }, "refs/tags/v0.2.0-beta.0");
  assert.throws(() => validateReleaseEvent(manifest, "push", event, "refs/tags/v0.1.0"), /published/);
  for (const action of ["created", "edited", "unpublished"]) {
    assert.throws(() => validateReleaseEvent(manifest, "release", { ...event, action }, "refs/tags/v0.1.0"), /published/);
  }
  for (const patch of [{ draft: true }, { tag_name: "v0.2.0" }, { prerelease: true }]) {
    assert.throws(() => validateReleaseEvent(manifest, "release", { ...event, release: { ...event.release, ...patch } }, "refs/tags/v0.1.0"));
  }
  assert.throws(() => validateReleaseEvent(manifest, "release", event, "refs/heads/main"), /tag/);
});

test("both receipts must identify the same tested package bytes", () => {
  const bytes = Buffer.from("tested tarball");
  const receipt = { ...manifest, sha256: createHash("sha256").update(bytes).digest("hex") };
  const integrity = validateTestedArtifact(manifest, receipt, receipt, bytes);
  assert.equal(integrity, `sha512-${createHash("sha512").update(bytes).digest("base64")}`);
  for (const patch of [{ name: "@other/cli" }, { version: "0.0.0" }, { sha256: "wrong" }]) {
    assert.throws(() => validateTestedArtifact(manifest, { ...receipt, ...patch }, receipt, bytes), /tested/);
    assert.throws(() => validateTestedArtifact(manifest, receipt, { ...receipt, ...patch }, bytes), /tested/);
  }
  assert.throws(() => validateTestedArtifact(manifest, receipt, receipt, Buffer.from("changed")), /tested/);
});

test("reruns skip only byte-identical published versions", () => {
  const metadata = { ...manifest, dist: { integrity: "sha512-tested" } };
  assert.equal(matchesPublishedArtifact(manifest, null, "sha512-tested"), false);
  assert.equal(matchesPublishedArtifact(manifest, metadata, "sha512-tested"), true);
  assert.throws(() => matchesPublishedArtifact(manifest, metadata, "sha512-other"), /different bytes/);
  assert.throws(() => matchesPublishedArtifact(manifest, { ...metadata, version: "0.2.0" }, "sha512-tested"), /different bytes/);
});

test("registry lookup distinguishes absent versions from network/auth failures", async () => {
  assert.equal(await publishedVersion(manifest, async (url) => {
    assert.equal(url, "https://registry.npmjs.org/%40flashlearnai%2Fcli/0.1.0");
    return new Response(null, { status: 404 });
  }), null);
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(publishedVersion(manifest, async () => new Response(null, { status })), /registry lookup failed/);
  }
  await assert.rejects(publishedVersion(manifest, async () => { throw new Error("offline"); }), /offline/);
  assert.deepEqual(await publishedVersion(manifest, async () => Response.json(manifest)), manifest);
});

test("publication verification waits for npm replication before giving up", async () => {
  const integrity = "sha512-tested";
  const metadata = { ...manifest, dist: { integrity } };
  const slept = [];
  const sleep = async (ms) => { slept.push(ms); };

  let lookups = 0;
  assert.equal(await waitForPublishedArtifact(manifest, integrity, {
    sleep,
    lookup: async () => (++lookups < 3 ? null : metadata),
  }), true);
  assert.equal(lookups, 3);
  assert.deepEqual(slept, [PUBLISH_REPLICATION_DELAY_MS, PUBLISH_VERIFY_INTERVAL_MS, PUBLISH_VERIFY_INTERVAL_MS]);

  slept.length = 0;
  assert.equal(await waitForPublishedArtifact(manifest, integrity, { sleep, lookup: async () => null }), false);
  assert.equal(slept.length, PUBLISH_VERIFY_ATTEMPTS);
  assert.ok(slept.reduce((total, ms) => total + ms, 0) >= 30_000);

  await assert.rejects(waitForPublishedArtifact(manifest, "sha512-other", { sleep, lookup: async () => metadata }), /different bytes/);
});
