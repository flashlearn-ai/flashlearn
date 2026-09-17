import { spawnSync } from "node:child_process";

// Hooks export Git paths. Tests creating a temporary repo must never inherit them.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "test", "--workspaces", "--if-present"], {
    env, stdio: "inherit", shell: process.platform === "win32",
  });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
