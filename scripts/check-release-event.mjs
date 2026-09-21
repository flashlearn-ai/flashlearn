import { releaseManifest } from "./release-lib.mjs";
import { checkReleaseContext } from "./release-context.mjs";

await checkReleaseContext(await releaseManifest(process.env.FLASHLEARN_RELEASE_ROOT));
console.log("Published release tag and version agree");
