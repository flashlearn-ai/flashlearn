import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const PROJECT_ENV = "FLASHLEARN_PROJECT";

export function projectConfigPath(environment = process.env): string {
  const configHome = environment.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(configHome, "flashlearn", "config.json");
}

export async function loadSavedProject(path = projectConfigPath()): Promise<string | null> {
  try {
    const config = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    return typeof config[PROJECT_ENV] === "string" ? config[PROJECT_ENV] : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function saveProject(project: string, path = projectConfigPath()): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ [PROJECT_ENV]: project }, null, 2)}\n`);
}
