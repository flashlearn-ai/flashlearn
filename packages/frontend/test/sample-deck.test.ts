import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { EXCERPTS, SAMPLE_DECK } from "../client/src/sample.js";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));

/** The sample deck ships inside a product whose claim is that every card cites
 *  the file it came from. A hand-written deck is only defensible if it is true,
 *  so these assertions check it against the working tree. */
test("every sample card cites a file that exists and quotes it verbatim", async () => {
  for (const card of SAMPLE_DECK) {
    const excerpt = EXCERPTS[card.id];
    assert(excerpt, `${card.id} has no excerpt`);

    let source: string;
    try {
      source = await readFile(new URL(card.source.path, `file://${REPO}`), "utf8");
    } catch {
      return assert.fail(`${card.id} cites a file that does not exist: ${card.source.path}`);
    }
    assert(
      source.includes(excerpt.code),
      `${card.id} quotes a line that is not in ${card.source.path}:\n  ${excerpt.code}`,
    );
  }
});

test("no sample card claims a commit, because the deck is not generated from one", () => {
  for (const card of SAMPLE_DECK) {
    assert.equal(card.source.sha, "unknown", `${card.id} cites a SHA the deck cannot stand behind`);
  }
});

test("sample answers are distinct, so the deck can supply real distractors", () => {
  const answers = SAMPLE_DECK.map((c) => c.answer);
  assert.equal(new Set(answers).size, answers.length);
  assert(SAMPLE_DECK.length >= 3, "a deck this small cannot offer three choices");
});
