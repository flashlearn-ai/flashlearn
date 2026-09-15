import assert from "node:assert/strict";
import test from "node:test";
import { CompositeExtractor, JsDocExtractor, MarkdownExtractor } from "../src/index.js";

const source = { path: "docs/guide.md", sha: "sha1" };

test("MarkdownExtractor turns headings into cards with the prose beneath them", async () => {
  const cards = await new MarkdownExtractor().extract({
    ...source,
    content: "# Setup\nRun npm install first.\nThen run the CLI.\n\n## Usage\nCall generate.\n",
  });

  assert.deepEqual(cards.map((card) => card.question), [
    'What does "Setup" cover?',
    'What does "Usage" cover?',
  ]);
  assert.equal(cards[0]?.answer, "Run npm install first. Then run the CLI.");
  assert.deepEqual(cards[1]?.source, source);
});

test("MarkdownExtractor ignores fenced code blocks and headingless prose", async () => {
  const cards = await new MarkdownExtractor().extract({
    ...source,
    content: "Intro text with no heading.\n\n# Real\n```\n# Not a heading\n```\nActual answer.\n",
  });

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.question, 'What does "Real" cover?');
  assert.equal(cards[0]?.answer, "Actual answer.");
});

test("MarkdownExtractor skips non-Markdown files", async () => {
  const cards = await new MarkdownExtractor().extract({ path: "src/a.ts", sha: "s", content: "# Heading\nBody.\n" });
  assert.deepEqual(cards, []);
});

test("JsDocExtractor documents exported functions and classes", async () => {
  const cards = await new JsDocExtractor().extract({
    path: "src/a.ts",
    sha: "sha2",
    content:
      "/** Adds two numbers.\n * @param a first\n */\nexport function add(a: number) {}\n\n/** Holds cards. */\nexport class Deck {}\n",
  });

  assert.deepEqual(cards.map((card) => card.question), [
    "What does `add()` do?",
    "What does `Deck` do?",
  ]);
  assert.equal(cards[0]?.answer, "Adds two numbers.", "@param tags are excluded");
  assert.deepEqual(cards[1]?.source, { path: "src/a.ts", sha: "sha2" });
});

test("JsDocExtractor ignores undocumented and non-exported declarations", async () => {
  const cards = await new JsDocExtractor().extract({
    path: "src/a.ts",
    sha: "s",
    content: "export function bare() {}\n/** Internal. */\nfunction hidden() {}\n",
  });
  assert.deepEqual(cards, []);
});

test("CompositeExtractor concatenates cards from every extractor", async () => {
  const composite = new CompositeExtractor(new MarkdownExtractor(), new JsDocExtractor());

  const markdown = await composite.extract({ ...source, content: "# Title\nBody text.\n" });
  const typescript = await composite.extract({
    path: "src/a.ts",
    sha: "s",
    content: "/** Does a thing. */\nexport function go() {}\n",
  });

  assert.equal(markdown.length, 1);
  assert.equal(typescript.length, 1);
  assert.equal(markdown[0]?.question, 'What does "Title" cover?');
  assert.equal(typescript[0]?.question, "What does `go()` do?");
});
