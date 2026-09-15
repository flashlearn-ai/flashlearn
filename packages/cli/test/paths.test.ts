import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { flashlearnRoot, projectRoot } from "../src/paths.js";

test("resolves project and FlashLearn roots consistently", () => {
  const expectedProjectRoot = resolve("example/repo");

  assert.equal(projectRoot("example/repo"), expectedProjectRoot);
  assert.equal(flashlearnRoot("example/repo"), resolve(expectedProjectRoot, ".flashlearn"));
});
