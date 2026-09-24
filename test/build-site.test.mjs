import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const script = join(root, "scripts/build-site.mjs");


/** Builds the site and reads back the pages a visitor would land on. */
async function buildSite(args = []) {
  // Never the real .release/site: a release run may have just built one there.
  const output = await mkdtemp(join(tmpdir(), "flashlearn-site-"));
  await rm(output, { recursive: true, force: true });
  await exec(process.execPath, [script, ...args], { cwd: root, env: { ...process.env, FLASHLEARN_SITE_OUT: output } });
  return {
    hero: await readFile(join(output, "index.html"), "utf8"),
    docs: await readFile(join(output, "docs/index.html"), "utf8"),
    demo: await stat(join(output, "demo")).then(() => true, () => false),
  };
}

/* The sample demo is a fixture deck, so publishing it is opt-in. Local default
 * builds omit it; Pages and artifact CI explicitly pass --demo. */
test("the default site build publishes no sample demo", async () => {
  const site = await buildSite();
  assert.equal(site.demo, false, "a default build must not emit demo/");
  assert.doesNotMatch(site.hero, /Try demo/, "the hero must not advertise a demo it did not build");
  assert.doesNotMatch(site.docs, /id="demo"/, "the docs must not keep a demo section");
  // Leaked markers would mean the stripping silently did not run.
  for (const [page, html] of [["hero", site.hero], ["docs", site.docs]]) {
    assert.doesNotMatch(html, /@@|<!--\s*\/?(NO)?DEMO\s*-->/, `${page} still contains build markers`);
  }
});

/* A link to a page that was never built is worse than no link: it 404s on the
 * public site. Whichever way the flag goes, markup and artifacts must agree. */
test("demo links are never published without the demo itself", async () => {
  const site = await buildSite();
  for (const [page, html] of [["hero", site.hero], ["docs", site.docs]]) {
    assert.doesNotMatch(html, /href="\.[./]*\/?demo\//, `${page} links to a demo that was not built`);
  }
});

/* The flag is the only way the sample demo reaches the site, so a build that
 * opts in must produce both the artifact and the links that reach it. */
test("--demo publishes the sample demo and the links to it", async () => {
  const site = await buildSite(["--demo"]);
  assert.equal(site.demo, true, "--demo must emit demo/");
  assert.match(site.hero, /href="\.\/demo\//, "the hero must link the demo it built");
  assert.match(site.docs, /id="demo"/, "the docs must keep the demo section");
  for (const [page, html] of [["hero", site.hero], ["docs", site.docs]]) {
    assert.doesNotMatch(html, /@@|<!--\s*\/?(NO)?DEMO\s*-->/, `${page} still contains build markers`);
  }
});

/* Installation is the primary action whether or not the sample demo ships. */
test("the hero leads with the same copyable install command in both modes", async () => {
  for (const args of [[], ["--demo"]]) {
    const { hero } = await buildSite(args);
    const section = hero.match(/<section class="hero">[\s\S]*?<\/section>/)?.[0] ?? "";
    assert.match(section, /<code id="install-command">npm i -g @flashlearnai\/cli<\/code>/);
    assert.equal((section.match(/class="button"/g) ?? []).length, 1);
    assert.match(section, /aria-label="Copy install command"/);
    assert.match(section, /flashlearn generate/);
    assert.match(section, /flashlearn review/);
    assert.match(hero, /src="\.\/install\.js"/);
  }
});
