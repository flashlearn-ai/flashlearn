import assert from "node:assert/strict";
import test from "node:test";
import { CompositeExtractor, ExportSignatureExtractor, GoDocExtractor, JsDocExtractor, MarkdownExtractor } from "../src/index.js";

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

test("MarkdownExtractor keeps list items on separate lines", async () => {
  const cards = await new MarkdownExtractor().extract({
    ...source,
    content: "# Tooling\n- Node.js 22 or newer.\n- TypeScript with ESM.\n- npm workspaces.\n",
  });

  assert.equal(cards[0]?.answer, "- Node.js 22 or newer.\n- TypeScript with ESM.\n- npm workspaces.");
});

test("MarkdownExtractor joins wrapped prose lines into one paragraph", async () => {
  const cards = await new MarkdownExtractor().extract({
    ...source,
    content: "# Intro\nThis sentence wraps\nacross two lines.\n",
  });

  assert.equal(cards[0]?.answer, "This sentence wraps across two lines.");
});

test("MarkdownExtractor skips contributor process documents", async () => {
  const markdown = new MarkdownExtractor();
  const content = "# Ownership\nEdit only your package.\n";

  assert.deepEqual(await markdown.extract({ path: "AGENTS.md", sha: "s", content }), []);
  assert.deepEqual(await markdown.extract({ path: "CONTRIBUTING.md", sha: "s", content }), []);
  assert.equal((await markdown.extract({ path: "README.md", sha: "s", content })).length, 1);
});

test("long answers truncate on a sentence boundary rather than mid-word", async () => {
  const sentence = "This sentence is padded so the section runs past the answer cap. ";
  const cards = await new MarkdownExtractor().extract({
    ...source,
    content: `# Long\n${sentence.repeat(20)}\n`,
  });

  const answer = cards[0]?.answer ?? "";
  assert.ok(answer.length <= 700, "answer stays within the cap");
  assert.ok(answer.endsWith("."), `expected a sentence boundary, got: ${answer.slice(-40)}`);
  assert.ok(!answer.includes("…"), "no mid-word ellipsis when a sentence boundary exists");
});

test("ExportSignatureExtractor locates undocumented exports only", async () => {
  const cards = await new ExportSignatureExtractor().extract({
    path: "packages/storage/src/repo.ts",
    sha: "sha3",
    content:
      "/** Documented. */\nexport class Documented {}\n\nexport interface CardRepository {}\nexport function bare() {}\n",
  });

  assert.deepEqual(cards.map((card) => card.question), [
    "Which file defines the `CardRepository` interface?",
    "Which file defines the `bare` function?",
  ]);
  assert.match(cards[0]?.answer ?? "", /packages\/storage\/src\/repo\.ts/);
  assert.deepEqual(cards[1]?.source, { path: "packages/storage/src/repo.ts", sha: "sha3" });
});

const goSource = { path: "pkg/controller/reconcile.go", sha: "sha4" };

test("GoDocExtractor documents exported declarations from doc comments", async () => {
  const cards = await new GoDocExtractor().extract({
    ...goSource,
    content:
      "// Reconcile drives the cluster toward the desired state.\nfunc Reconcile(ctx context.Context) error {\n\treturn nil\n}\n\n// Options configures the controller.\ntype Options struct{}\n",
  });

  assert.deepEqual(cards.map((card) => card.question), [
    "What does `Reconcile()` do?",
    "What does `Options` do?",
  ]);
  assert.equal(cards[0]?.answer, "Reconcile drives the cluster toward the desired state.");
  assert.deepEqual(cards[1]?.source, goSource);
});

test("GoDocExtractor joins multi-line doc comments into one paragraph", async () => {
  const cards = await new GoDocExtractor().extract({
    ...goSource,
    content: "// Sync copies state from the informer cache\n// into the work queue.\nfunc Sync() {}\n",
  });

  assert.equal(cards[0]?.answer, "Sync copies state from the informer cache into the work queue.");
});

test("GoDocExtractor ignores unexported declarations and undocumented exports", async () => {
  const cards = await new GoDocExtractor().extract({
    ...goSource,
    content: "// reconcile is internal.\nfunc reconcile() {}\n\nfunc Exported() {}\n",
  });

  assert.deepEqual(cards, []);
});

test("GoDocExtractor skips Go test files and non-Go sources", async () => {
  const extractor = new GoDocExtractor();
  const content = "// Reconcile does a thing.\nfunc Reconcile() {}\n";

  assert.deepEqual(await extractor.extract({ path: "pkg/a_test.go", sha: "s", content }), []);
  assert.deepEqual(await extractor.extract({ path: "src/a.ts", sha: "s", content }), []);
});

test("ExportSignatureExtractor covers undocumented Go exports without duplicating GoDocExtractor", async () => {
  const content = "// Documented explains itself.\nfunc Documented() {}\n\ntype CacheStore struct{}\n";
  const input = { ...goSource, content };

  const locators = await new ExportSignatureExtractor().extract(input);
  const docs = await new GoDocExtractor().extract(input);

  assert.deepEqual(locators.map((card) => card.question), [
    "Which file defines the `CacheStore` type?",
  ]);
  assert.deepEqual(docs.map((card) => card.question), ["What does `Documented()` do?"]);
});
