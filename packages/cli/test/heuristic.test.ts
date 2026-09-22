import assert from "node:assert/strict";
import test from "node:test";
import { heuristicCards } from "../src/heuristic.js";

const document = (content: string, path = "README.md") => ({ path, content, sha: "real" });

test("offline definitions preserve full source meaning and useful domain terms", () => {
  const cards = heuristicCards(document("# Runtime\n## Concepts\n- **Worker**: a persistent process that runs one workload at a time. It must release resources before reuse.\n- **Actor**: a suspended application with persistent identity and snapshots. It can move between workers.\n"));
  assert.equal(cards.length, 2);
  assert.match(cards[0]!.question, /what does Worker mean/);
  assert.equal(cards[0]!.answer, "Worker: a persistent process that runs one workload at a time. It must release resources before reuse.");
});

test("procedures, badges and fenced examples never turn into incomplete cards", () => {
  const cards = heuristicCards(document("# Runtime\n![badge](https://example.test/badge)\nNOTE: Not an officially supported product.\n## Installation\n### Worker\nWorkers must be installed before use. Install instructions are important.\n## Retry policy\nRequests retry according to the following:\n```sh\nrun --retry\n```\n## Notes\nThis refers to the steps above.\n"));
  assert.deepEqual(cards, []);
});

test("sentence extraction keeps abbreviation prefixes and rejects dangling fragments", () => {
  const content = "# Runtime\n## Recovery\nThe scheduler restores state (e.g. after worker failure). It must reserve capacity before running.\n";
  const cards = heuristicCards(document(content));
  assert.equal(cards.length, 1);
  assert.match(cards[0]!.answer, /^The scheduler restores state \(e.g. after worker failure\)/);
  assert.deepEqual(heuristicCards(document("# Runtime\n## Recovery\nThe scheduler restores state after failure and requires:\n")), []);
});

test("code recall cites the file and retains rationale without inventing a why answer", () => {
  const content = "// Store is a persistent cache holding immutable snapshots.\n//\n// Keys must change when source content changes to avoid stale reads.\ntype Store struct {}";
  const [card] = heuristicCards(document(content, "cache/store.go"));
  assert.match(card!.question, /`Store`.*cache\/store.go/);
  assert.match(card!.answer, /Keys must change/);
  assert.deepEqual(card!.source, { path: "cache/store.go", sha: "real" });
});

test("aspirational documentation is qualified and procedure repositories are excluded", () => {
  const source = "# Architecture\nNOTE: This architecture is aspirational.\n## Worker lifecycle\nWorkers restore persistent snapshots before routing traffic to the application.\n";
  assert.match(heuristicCards(document(source))[0]!.answer, /^Documented design/);
  assert.deepEqual(heuristicCards(document(source, "tools/setup/README.md")), []);
});
