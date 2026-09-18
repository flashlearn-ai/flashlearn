import assert from "node:assert/strict";
import test from "node:test";
import { toYaml } from "../src/yaml.js";

test("empty YAML containers remain nested values rather than new root documents", () => {
  assert.equal(toYaml([]), "[]");
  assert.equal(toYaml({}), "{}");
  assert.equal(toYaml({ tags: [], metadata: {}, nested: { tags: [] } }), [
    "tags:",
    "  []",
    "metadata:",
    "  {}",
    "nested:",
    "  tags:",
    "    []",
  ].join("\n"));
});

test("empty containers in sequences preserve sequence and mapping structure", () => {
  assert.equal(toYaml([[], {}, { tags: [], source: {} }, [[], {}]]), [
    "- []",
    "- {}",
    "- tags:",
    "    []",
    "  source:",
    "    {}",
    "- - []",
    "  - {}",
  ].join("\n"));
});

test("YAML strings retain newlines, quotes and scalar-looking values as strings", () => {
  assert.equal(toYaml({ question: 'Why: "yes"?\n# comment', tags: ["null", "true", "2026-01-01", "[]"], count: 0, empty: null }), [
    'question: "Why: \\"yes\\"?\\n# comment"',
    "tags:",
    '  - "null"',
    '  - "true"',
    '  - "2026-01-01"',
    '  - "[]"',
    "count: 0",
    "empty: null",
  ].join("\n"));
});
