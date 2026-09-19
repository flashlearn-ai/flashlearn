import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, npmCommand, releaseManifest, run } from "./release-lib.mjs";

const manifest = await releaseManifest();

/* The sample demo runs on a fixture deck, so it is opt-in rather than part of
 * every build: `npm run site:build -- --demo`. Pages deploys a default build,
 * which therefore publishes no sample content. Demo-only markup is fenced with
 * `<!--DEMO-->` so the artifact and the links to it are decided together and
 * cannot drift into a published link to a page that was never built. The
 * `<!--NODEMO-->` counterpart carries the markup that replaces it, so the hero
 * keeps exactly one primary call to action either way. */
const withDemo = process.argv.includes("--demo");
const DEMO_BLOCK = /<!--DEMO-->[\s\S]*?<!--\/DEMO-->/g;
const NODEMO_BLOCK = /<!--NODEMO-->[\s\S]*?<!--\/NODEMO-->/g;

/** Keeps demo-only markup when the demo ships, and its replacement when it does not. */
function applyDemo(html) {
  const [drop, keep] = withDemo ? [NODEMO_BLOCK, /<!--\/?DEMO-->/g] : [DEMO_BLOCK, /<!--\/?NODEMO-->/g];
  return html.replace(drop, "").replace(keep, "");
}

if (withDemo) run(npmCommand, ["run", "demo", "--workspace", "@flashlearn/frontend"]);
// Tests build into a scratch directory so checking the builder cannot destroy
// the Pages artifact a release run just produced.
const output = process.env.FLASHLEARN_SITE_OUT ?? join(ROOT, ".release/site");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(ROOT, "site"), output, { recursive: true });
if (withDemo) await cp(join(ROOT, "packages/frontend/client/dist-demo"), join(output, "demo"), { recursive: true });
await cp(join(ROOT, "flashlearn icon.png"), join(output, "icon.png"));
for (const page of ["index.html", "docs/index.html"]) {
  const file = join(output, page);
  await writeFile(file, applyDemo((await readFile(file, "utf8")).replaceAll("@@VERSION@@", manifest.version)));
}
await writeFile(join(output, ".nojekyll"), "");
console.log(`Built .release/site: landing page, tool documentation${withDemo ? ", and static sample demo" : " (no sample demo; pass --demo to include it)"}`);
