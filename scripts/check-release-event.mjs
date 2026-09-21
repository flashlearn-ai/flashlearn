import { readFile } from "node:fs/promises";
import { releaseManifest } from "./release-lib.mjs";
import { validateReleaseEvent } from "./release-validation.mjs";

validateReleaseEvent(await releaseManifest(), process.env.GITHUB_EVENT_NAME,
  JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8")), process.env.GITHUB_REF);
console.log("Published release tag and version agree");
