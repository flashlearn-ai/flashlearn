import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Serializes operations per path so concurrent read-modify-write cannot clobber. */
const chains = new Map<string, Promise<unknown>>();

function serialize<T>(path: string, task: () => Promise<T>): Promise<T> {
  const next = (chains.get(path) ?? Promise.resolve()).then(task, task);
  chains.set(path, next.catch(() => {}));
  return next;
}

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Corrupt JSON in ${path}`);
  }
}

export function writeJson(path: string, value: unknown): Promise<void> {
  return serialize(path, () => atomicWrite(path, value));
}

/** Serialized read-modify-write; the mutation sees the latest persisted value. */
export function updateJson(path: string, mutate: (current: unknown) => unknown): Promise<void> {
  return serialize(path, async () => {
    const current = await readJson<unknown>(path, undefined);
    await atomicWrite(path, mutate(current));
  });
}

async function atomicWrite(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, path);
}
