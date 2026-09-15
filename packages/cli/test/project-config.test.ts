import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadSavedProject, saveProject } from "../src/project-config.js";

test("persists and loads the selected project", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "flashlearn-config-")), "config.json");
  assert.equal(await loadSavedProject(path), null);
  await saveProject("/repo", path);
  assert.equal(await loadSavedProject(path), "/repo");
});
