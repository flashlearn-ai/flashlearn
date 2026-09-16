import type { Card } from "../../../../contracts/index.js";

// Hand-authored public examples for an imaginary repo, never extracted user data.
export const DEMO_CARDS: Card[] = [
  {
    id: "demo-startup", question: "Where would you begin tracing a web request?",
    answer: "Start at the route handler, then follow calls into services and repositories.",
    source: { path: "sample-repo/routes/hello.ts", sha: "demo-sample" }, tags: ["Request flow"],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "demo-storage", question: "Why keep persistence behind a repository interface?",
    answer: "Callers can use the same interface with a database, a file store, or an in-memory test double.",
    source: { path: "sample-repo/storage/repository.ts", sha: "demo-sample" }, tags: ["Storage"],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "demo-review", question: "What makes a study card useful for onboarding?",
    answer: "A focused question, a concise answer, and a source reference you can follow back into the code.",
    source: { path: "sample-repo/docs/onboarding.md", sha: "demo-sample" }, tags: ["Onboarding"],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  },
];
