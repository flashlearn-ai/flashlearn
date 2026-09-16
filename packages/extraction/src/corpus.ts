import { formatReport, summarizeCards } from "./report.js";
import { generateCards, type GenerateOptions } from "./workstream.js";

/**
 * Report on the cards a repository produces. Run against an external clone to
 * compare extraction changes on real code. Scope to a subdirectory on large
 * repositories, where a whole-repository run is neither fast nor useful:
 *
 * ```bash
 * npm run report --workspace @flashlearn/extraction -- /abs/path/to/repo pkg/kubelet
 * ```
 */
export async function reportOnRepository(root: string, options: GenerateOptions = {}): Promise<string> {
  return formatReport(summarizeCards(await generateCards(root, undefined, options)));
}

const invokedDirectly = process.argv[1]?.endsWith("corpus.ts") || process.argv[1]?.endsWith("corpus.js");

if (invokedDirectly) {
  const root = process.argv[2];
  const subpath = process.argv[3];
  if (!root) {
    console.error("Usage: npm run report --workspace @flashlearn/extraction -- <repository> [subpath]");
    process.exit(2);
  }

  reportOnRepository(root, subpath ? { subpath } : {}).then(
    (output) => console.log(output),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
