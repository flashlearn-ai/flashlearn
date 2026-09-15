import { formatReport, summarizeCards } from "./report.js";
import { generateCards } from "./workstream.js";

/**
 * Report on the cards a repository produces. Run against an external clone to
 * compare extraction changes on real code:
 *
 * ```bash
 * npm run report --workspace @flashlearn/extraction -- /path/to/repo
 * ```
 */
export async function reportOnRepository(root: string): Promise<string> {
  return formatReport(summarizeCards(await generateCards(root)));
}

const invokedDirectly = process.argv[1]?.endsWith("corpus.ts") || process.argv[1]?.endsWith("corpus.js");

if (invokedDirectly) {
  const root = process.argv[2];
  if (!root) {
    console.error("Usage: npm run report --workspace @flashlearn/extraction -- <repository>");
    process.exit(2);
  }

  reportOnRepository(root).then(
    (output) => console.log(output),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    },
  );
}
