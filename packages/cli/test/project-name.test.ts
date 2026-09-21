import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readProjectName } from "../src/project-name.js";

/** A project directory containing the given files. */
async function project(files: Record<string, string>, run: (root: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-name-"));
  try {
    for (const [name, contents] of Object.entries(files)) await writeFile(join(root, name), contents);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("a package manifest declares the name", async () => {
  await project({ "package.json": JSON.stringify({ name: "flashlearn" }) }, async (root) => {
    assert.equal(await readProjectName(root), "flashlearn");
  });
});

test("a Go module is named by the last segment of its path", async () => {
  await project({ "go.mod": "module k8s.io/kubernetes\n\ngo 1.24\n" }, async (root) => {
    assert.equal(await readProjectName(root), "kubernetes");
  });
});

test("a manifest is preferred over a module path", async () => {
  await project({
    "package.json": JSON.stringify({ name: "declared" }),
    "go.mod": "module example.com/other\n",
  }, async (root) => {
    assert.equal(await readProjectName(root), "declared");
  });
});

/** A project that declares nothing has no name. The alternatives were measured
 *  and rejected: a directory name titles a copy by the copy, and a README
 *  heading differed from the real name in 43% of the packages installed here. */
test("a project that declares nothing has no name", async () => {
  await project({ "README.md": "# Getting Started\n\nProse.\n", "notes.txt": "x" }, async (root) => {
    assert.equal(await readProjectName(root), null, "a README heading is not a declaration");
  });
});

test("an empty directory has no name", async () => {
  await project({}, async (root) => assert.equal(await readProjectName(root), null));
});

test("a malformed manifest falls through rather than failing the server", async () => {
  await project({ "package.json": "{ not json", "go.mod": "module example.com/fallback\n" }, async (root) => {
    assert.equal(await readProjectName(root), "fallback");
  });
});

test("a manifest without a name falls through", async () => {
  await project({
    "package.json": JSON.stringify({ version: "1.0.0" }),
    "go.mod": "module example.com/fallback\n",
  }, async (root) => {
    assert.equal(await readProjectName(root), "fallback");
  });
});

test("a manifest name that is not a string is ignored", async () => {
  await project({ "package.json": JSON.stringify({ name: 42 }) }, async (root) => {
    assert.equal(await readProjectName(root), null);
  });
});

test("a blank or whitespace name is no name", async () => {
  for (const name of ["", "   "]) {
    await project({ "package.json": JSON.stringify({ name }) }, async (root) => {
      assert.equal(await readProjectName(root), null);
    });
  }
});

test("a go.mod without a module line has nothing to read", async () => {
  await project({ "go.mod": "go 1.24\n\nrequire example.com/x v1.0.0\n" }, async (root) => {
    assert.equal(await readProjectName(root), null);
  });
});

test("a missing directory reports no name rather than throwing", async () => {
  assert.equal(await readProjectName(join(tmpdir(), "flashlearn-does-not-exist-9f3a")), null);
});
