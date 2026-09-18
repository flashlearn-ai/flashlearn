import { createInterface } from "node:readline/promises";

export async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return false;
  const reader = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await reader.question(message);
    return /^(y|yes)$/i.test(answer.trim());
  } finally {
    reader.close();
  }
}
