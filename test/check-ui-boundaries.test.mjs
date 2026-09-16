import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/check-boundaries.mjs", import.meta.url));

test("UI TSX files are subject to the non-CLI import boundary", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "flashlearn-ui-boundary-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ui = join(root, "packages/frontend/ui");
  await mkdir(ui, { recursive: true });
  await writeFile(join(ui, "App.tsx"), 'import { scheduleReview } from "@flashlearn/learning";');
  assert.throws(() => execFileSync(process.execPath, [script], { cwd: root, stdio: "pipe" }), (error) => {
    assert.equal(error.status, 1);
    assert.match(error.stderr.toString(), /App\.tsx imports learning/);
    return true;
  });
  await writeFile(join(ui, "App.tsx"), 'import type { Card } from "../../../contracts/index.js";');
  assert.match(execFileSync(process.execPath, [script], { cwd: root, encoding: "utf8" }), /boundaries are valid/);
});
