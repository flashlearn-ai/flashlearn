import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
export function run(command, args, options = {}) {
  // Invoke npm through Node when launched by an npm script; avoids cmd.exe
  // quoting issues for tarballs and project directories containing spaces.
  if (command === npmCommand && process.env.npm_execpath) {
    args = [process.env.npm_execpath, ...args];
    command = process.execPath;
  }
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit", ...options,
    shell: options.shell ?? command === "npm.cmd" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
  return result.stdout;
}

export function validateManifest(manifest) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(manifest.version)) throw new Error("Invalid release version");
  if (manifest.name !== "flashlearn" || manifest.private || manifest.dependencies || manifest.devDependencies || manifest.scripts) throw new Error("Release must be a standalone CLI-only manifest");
  if (manifest.bin?.flashlearn !== "dist/index.js" || manifest.license !== "MIT") throw new Error("Invalid release bin or license");
  return manifest;
}
export async function releaseManifest() {
  return validateManifest(JSON.parse(await readFile(new URL("../release/package.json", import.meta.url), "utf8")));
}
export function distTag(version) { return version.includes("-") ? "next" : "latest"; }
