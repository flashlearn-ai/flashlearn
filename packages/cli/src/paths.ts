import { join, resolve } from "node:path";

export function projectRoot(input: string): string {
  return resolve(input);
}

export function flashlearnRoot(input: string): string {
  return join(projectRoot(input), ".flashlearn");
}
