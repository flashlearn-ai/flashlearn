import assert from "node:assert/strict";
import test from "node:test";
import { AnnotationExtractor } from "../src/index.js";

test("extracts adjacent question and answer annotations", async () => {
  const cards = await new AnnotationExtractor().extract({ path: "src/a.ts", sha: "abc", content: "// Q: What is A?\n// A: A value.\n" });
  assert.deepEqual(cards, [{ question: "What is A?", answer: "A value.", source: { path: "src/a.ts", sha: "abc" } }]);
});
