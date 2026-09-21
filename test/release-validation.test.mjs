import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { validateReleaseEvent, validateTestedArtifact, matchesPublishedArtifact, publishedVersion, waitForPublishedArtifact, RegistryLookupError } from "../scripts/release-validation.mjs";

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

function pollingClock(lookup, timeoutMs = 300_000) {
  let time = 0;
  const messages = [];
  const sleeps = [];
  return {
    options: { lookup, timeoutMs, now: () => time, sleep: async (ms) => { sleeps.push(ms); time += ms; }, log: (message) => messages.push(message) },
    messages, sleeps, elapsed: () => time,
  };
}

test("publication waits through minutes of 404s rather than failing after 30 seconds", async () => {
  let attempts = 0;
  const clock = pollingClock(async () => ++attempts < 14 ? null : { ...manifest, dist: { integrity: "sha512-tested" } });
  await waitForPublishedArtifact(manifest, "sha512-tested", clock.options);
  assert.equal(attempts, 14);
  assert.equal(clock.elapsed(), 130_000);
  assert.match(clock.messages[0], /Waiting up to 300s/);
  assert.match(clock.messages.at(-1), /120s elapsed/);
});

test("verification retries transient HTTP and network failures without republishing", async () => {
  const failures = [408, 429, 500, 503, "network", "body"];
  const clock = pollingClock(async () => {
    const failure = failures.shift();
    return publishedVersion(manifest, async () => {
      if (failure === "network") throw new Error("connection reset");
      if (failure === "body") return new Response("invalid json");
      return failure ? new Response(null, { status: failure }) : Response.json({ ...manifest, dist: { integrity: "sha512-tested" } });
    });
  });
  await waitForPublishedArtifact(manifest, "sha512-tested", clock.options);
  assert.equal(clock.sleeps.length, 6);
});

test("auth failures, unexpected errors and artifact mismatches fail immediately", async () => {
  for (const lookup of [
    () => publishedVersion(manifest, async () => new Response(null, { status: 401 })),
    () => publishedVersion(manifest, async () => new Response(null, { status: 403 })),
    async () => { throw new Error("bug"); },
    async () => ({ ...manifest, dist: { integrity: "sha512-wrong" } }),
  ]) {
    const clock = pollingClock(lookup);
    await assert.rejects(waitForPublishedArtifact(manifest, "sha512-tested", clock.options), /HTTP 401|HTTP 403|bug|different bytes/);
    assert.deepEqual(clock.sleeps, []);
  }
});

test("deadline bounds sleeps and remaining lookup budget, with actionable timeout", async () => {
  const budgets = [];
  const clock = pollingClock(async (_manifest, budget) => { budgets.push(budget); return null; }, 25_000);
  await assert.rejects(waitForPublishedArtifact(manifest, "sha512-tested", clock.options), /npm accepted publication.*within 25s/);
  assert.deepEqual(budgets, [25_000, 15_000, 5_000]);
  assert.deepEqual(clock.sleeps, [10_000, 10_000, 5_000]);
  const outage = pollingClock(async () => { throw new RegistryLookupError("registry unavailable", true); }, 1);
  await assert.rejects(waitForPublishedArtifact(manifest, "sha512-tested", outage.options), /registry unavailable/);
});
