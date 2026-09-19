/** Which project the deck came from, for a pane that would otherwise show only
 *  generic topic names: `Metrics` and `Framework` look the same whatever they
 *  were generated from. */
import type { ProjectIdentity } from "../../../../../contracts/index";

const TIMEOUT_MS = 5_000;

/** The project's declared name, or null.
 *
 *  Never throws and never reports a failure to the user: a deck title is not
 *  worth interrupting a session for, and a project that declares no name is
 *  indistinguishable from one the server could not describe. Both show nothing,
 *  which is the honest rendering of "not known" — a directory name would be
 *  wrong as often as right. */
export async function loadProjectName(): Promise<string | null> {
  try {
    const response = await fetch("/api/project", { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) return null;
    return projectName(await response.json());
  } catch {
    return null;
  }
}

/** Validates at the boundary: the response is untrusted input to this client. */
export function projectName(payload: unknown): string | null {
  const identity = payload as Partial<ProjectIdentity> | null | undefined;
  if (typeof identity?.name !== "string") return null;
  const name = identity.name.trim();
  return name.length > 0 ? name : null;
}
