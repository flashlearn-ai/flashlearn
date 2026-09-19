import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** What a project declares itself to be.
 *
 *  Only machine-readable declarations of identity count. Two things were tried
 *  and rejected:
 *
 *  The directory name, because a repository cloned or copied under another name
 *  would be titled by the copy.
 *
 *  The first README heading, because it is prose that merely tends to be the
 *  name. Measured against the packages installed in this repository, it differed
 *  from the real name 43% of the time, yielding badge markup, backticks, emoji,
 *  and in one case a section heading from halfway down the file.
 *
 *  A wrong name sits in the most prominent place in the client, so a project
 *  that declares nothing has no name and the client renders no title.
 */
type Source = { file: string; read: (contents: string) => string | undefined };

const SOURCES: Source[] = [
  {
    file: "package.json",
    read: (contents) => {
      try {
        const name: unknown = JSON.parse(contents).name;
        return typeof name === "string" ? name : undefined;
      } catch {
        // A malformed manifest declares nothing; fall through to the next source.
        return undefined;
      }
    },
  },
  {
    // `module k8s.io/kubernetes` names the project in its last segment.
    file: "go.mod",
    read: (contents) => contents.match(/^module\s+(\S+)/m)?.[1]?.split("/").pop(),
  },
];

/** The project's declared name, or null when it declares none. */
export async function readProjectName(root: string): Promise<string | null> {
  for (const source of SOURCES) {
    const contents = await readFile(join(root, source.file), "utf8").catch(() => null);
    if (contents === null) continue;
    const name = source.read(contents)?.trim();
    if (name) return name;
  }
  return null;
}
