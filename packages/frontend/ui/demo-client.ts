import { DEMO_CARDS } from "../test/fixtures/demo.js";
import type { StudyClient } from "./client.js";

// Demo-only queue. No network, disk access, or imitation scheduling algorithm.
export function createDemoClient(): StudyClient {
  const completed = new Set<string>();
  return {
    list: async () => structuredClone(DEMO_CARDS),
    next: async () => {
      const card = DEMO_CARDS.find(({ id }) => !completed.has(id));
      return card ? { id: card.id, question: card.question, source: { ...card.source } } : null;
    },
    reveal: async (id) => {
      const card = DEMO_CARDS.find((card) => card.id === id);
      if (!card) throw new Error("Sample card not found");
      return structuredClone(card);
    },
    review: async (id) => {
      if (!DEMO_CARDS.some((card) => card.id === id)) throw new Error("Sample card not found");
      completed.add(id);
      return null;
    },
  };
}
