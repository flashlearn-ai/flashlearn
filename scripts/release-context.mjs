import { readFile } from "node:fs/promises";
import { validateReleaseEvent } from "./release-validation.mjs";

/** Release selection is application data, not a replacement for the OIDC context. */
export function validateReleaseContext(manifest, env, event, resolvedEvent) {
  if (env.GITHUB_EVENT_NAME === "release") {
    validateReleaseEvent(manifest, "release", event, env.GITHUB_REF);
  } else if (env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    if (!resolvedEvent || event?.inputs?.tag !== resolvedEvent.release?.tag_name) {
      throw new Error("Manual publishing requires resolved metadata matching the requested release tag");
    }
  } else {
    throw new Error("Publishing requires a release or workflow_dispatch event");
  }
  if (resolvedEvent) {
    validateReleaseEvent(manifest, "release", resolvedEvent, `refs/tags/${resolvedEvent.release?.tag_name}`);
  }
}

export async function checkReleaseContext(manifest, env = process.env) {
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  const resolvedEvent = env.FLASHLEARN_RELEASE_EVENT ? JSON.parse(env.FLASHLEARN_RELEASE_EVENT) : undefined;
  validateReleaseContext(manifest, env, event, resolvedEvent);
}
