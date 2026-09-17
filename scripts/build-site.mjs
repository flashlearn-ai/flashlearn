import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, npmCommand, releaseManifest, run } from "./release-lib.mjs";

const manifest = await releaseManifest();
run(npmCommand, ["run", "demo", "--workspace", "@flashlearn/frontend"]);
const output = join(ROOT, ".release/site");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(ROOT, "site"), output, { recursive: true });
await cp(join(ROOT, "packages/frontend/client/dist-demo"), join(output, "demo"), { recursive: true });
await cp(join(ROOT, "flashlearn icon.png"), join(output, "icon.png"));
const docs = join(output, "docs/index.html");
await writeFile(docs, (await readFile(docs, "utf8")).replaceAll("@@VERSION@@", manifest.version));
await writeFile(join(output, ".nojekyll"), "");
console.log("Built .release/site: landing page, tool documentation, and static sample demo");
