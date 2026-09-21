import assert from "node:assert/strict";
import test from "node:test";
import { publishedReleaseContext } from "../scripts/resolve-release.mjs";
import { validateReleaseEvent } from "../scripts/release-validation.mjs";

test("manual retries resolve stable and prerelease tags to the existing validation path", () => {
  for (const version of ["0.2.0", "0.3.0-beta.1"]) {
    const tag = `v${version}`;
    const release = { tag_name: tag, draft: false, prerelease: version.includes("-"), published_at: "2026-09-21T00:00:00Z" };
    const context = publishedReleaseContext(tag, release);
    assert.deepEqual(context, { action: "published", release });
    validateReleaseEvent({ version }, "release", context, `refs/tags/${tag}`);
    assert.throws(() => validateReleaseEvent({ version: "9.9.9" }, "release", context, `refs/tags/${tag}`), /tag/);
  }
});

test("retry resolution rejects drafts, missing publication, mismatched tags and unsafe inputs", () => {
  const release = { tag_name: "v0.2.0", draft: false, prerelease: false, published_at: "2026-09-21T00:00:00Z" };
  for (const tag of [undefined, "", "main", "0.2.0", "v0.2.0\nevent=bad", "../main"]) {
    assert.throws(() => publishedReleaseContext(tag, release), /version tag/);
  }
  for (const patch of [{ draft: true }, { published_at: null }, { tag_name: "v0.1.0" }, { prerelease: undefined }]) {
    assert.throws(() => publishedReleaseContext("v0.2.0", { ...release, ...patch }), /published GitHub Release/);
  }
  assert.throws(() => publishedReleaseContext("v0.2.0", null), /published GitHub Release/);
});
