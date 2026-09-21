import assert from "node:assert/strict";
import test from "node:test";
import { createRelease } from "../scripts/create-release.mjs";

const sha = "a".repeat(40);
const options = { manifest: { version: "0.2.0" }, sha, ref: "refs/heads/main", repo: "example/project" };

test("creation derives stable/prerelease tags and pins them before explicitly dispatching publishing", async () => {
  for (const version of ["0.2.0", "0.3.0-beta.1"]) {
    const calls = [];
    const tag = await createRelease({ ...options, manifest: { version }, gh: async (args, optional) => {
      calls.push(args);
      return optional ? null : {};
    } });
    assert.equal(tag, `v${version}`);
    assert.deepEqual(calls[1], ["api", "--method", "POST", "repos/example/project/git/refs", "-f", `ref=refs/tags/${tag}`, "-f", `sha=${sha}`]);
    assert(calls[3].includes(`tag_name=${tag}`));
    assert(calls[3].includes(`prerelease=${version.includes("-")}`));
    assert.deepEqual(calls[4], ["api", "--method", "POST", "repos/example/project/actions/workflows/publish.yml/dispatches", "-f", "ref=main", "-f", `inputs[tag]=${tag}`]);
  }
});

test("rerunning after a dispatch failure reuses the same tag and published release", async () => {
  const calls = [];
  const gh = async (args) => {
    calls.push(args);
    if (args[1].includes("/git/ref/")) return {};
    if (args[1].includes("/commits/")) return { sha };
    if (args[1].includes("/releases/tags/")) return { tag_name: "v0.2.0", draft: false, prerelease: false };
    return null;
  };
  assert.equal(await createRelease({ ...options, gh }), "v0.2.0");
  assert.equal(calls.filter((args) => args.includes("POST")).length, 1);
  assert(calls.at(-1).some((arg) => arg.endsWith("/dispatches")));
});

test("wrong branch, retagging, drafts and metadata failures never dispatch publishing", async () => {
  await assert.rejects(createRelease({ ...options, ref: "refs/heads/feature", gh: async () => assert.fail() }), /main only/);
  for (const problem of ["commit", "draft", "network"]) {
    let dispatched = false;
    const gh = async (args) => {
      if (args[1].includes("/git/ref/")) {
        if (problem === "network") throw new Error("offline");
        return {};
      }
      if (args[1].includes("/commits/")) return { sha: problem === "commit" ? "b".repeat(40) : sha };
      if (args[1].includes("/releases/tags/")) return { tag_name: "v0.2.0", draft: true, prerelease: false };
      dispatched = true;
    };
    await assert.rejects(createRelease({ ...options, gh }), /another commit|published GitHub Release|offline/);
    assert.equal(dispatched, false);
  }
});
