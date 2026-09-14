import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Card, CardRepository, ReviewRepository, ReviewState } from "../../../contracts/index.js";

export { StarterCardRepository, StarterReviewRepository, StorageService } from "./workstream.js";
export type { StorageWorkstream } from "./workstream.js";

export const DEFAULT_REVIEW_STATE = (cardId: string): ReviewState => ({
  cardId,
  easeFactor: 2.5,
  intervalDays: 0,
  reviewCount: 0,
  correctCount: 0,
});

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryPath, path);
}

export class JsonCardRepository implements CardRepository {
  constructor(private readonly path: string) {}

  async save(card: Card): Promise<void> {
    const cards = await this.list();
    const index = cards.findIndex(({ id }) => id === card.id);
    if (index === -1) cards.push(card);
    else cards[index] = card;
    await writeJson(this.path, cards);
  }

  async get(id: string): Promise<Card | null> {
    return (await this.list()).find((card) => card.id === id) ?? null;
  }

  list(): Promise<Card[]> {
    return readJson(this.path, []);
  }

  async delete(id: string): Promise<void> {
    await writeJson(this.path, (await this.list()).filter((card) => card.id !== id));
  }
}

export class JsonReviewRepository implements ReviewRepository {
  constructor(private readonly path: string) {}

  async get(cardId: string): Promise<ReviewState> {
    const states = await readJson<Record<string, ReviewState>>(this.path, {});
    return states[cardId] ?? DEFAULT_REVIEW_STATE(cardId);
  }

  async save(state: ReviewState): Promise<void> {
    const states = await readJson<Record<string, ReviewState>>(this.path, {});
    states[state.cardId] = state;
    await writeJson(this.path, states);
  }
}

export async function initializeStore(root: string): Promise<void> {
  const directory = join(root, ".flashlearn");
  await mkdir(directory, { recursive: true });
  const files: Array<[string, unknown]> = [
    ["cards.json", []],
    ["review.json", {}],
    ["settings.json", { version: 1 }],
  ];
  await Promise.all(files.map(async ([name, initial]) => {
    const path = join(directory, name);
    try {
      await writeFile(path, `${JSON.stringify(initial, null, 2)}\n`, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }));
}
