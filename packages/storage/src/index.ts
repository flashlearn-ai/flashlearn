import { mkdir, writeFile } from "node:fs/promises";
import { cardsPath, reviewPath, settingsPath, storeRoot } from "./paths.js";

export { DEFAULT_REVIEW_STATE, JsonCardRepository, JsonReviewRepository } from "./repositories.js";
export { cardsPath, reviewPath, settingsPath, storeRoot } from "./paths.js";
export { readJson, writeJson } from "./json.js";
export { isCard, isReviewState, isSafeKey } from "./validate.js";
export { StorageService } from "./workstream.js";
export type { StorageWorkstream } from "./workstream.js";

export async function initializeStore(root: string): Promise<void> {
  await mkdir(storeRoot(root), { recursive: true });
  const files: Array<[string, unknown]> = [
    [cardsPath(root), []],
    [reviewPath(root), {}],
    [settingsPath(root), { version: 1 }],
  ];
  await Promise.all(files.map(async ([path, initial]) => {
    try {
      await writeFile(path, `${JSON.stringify(initial, null, 2)}\n`, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }));
}
