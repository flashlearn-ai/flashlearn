import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

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

export async function prompt(message: string, secret = false): Promise<string | null> {
  if (!process.stdin.isTTY || !process.stderr.isTTY) return null;
  if (!secret) {
    const reader = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return await reader.question(message);
    } finally {
      reader.close();
    }
  }

  process.stderr.write(message);
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input: process.stdin, output: muted, terminal: true });
  try {
    const answer = await reader.question("");
    process.stderr.write("\n");
    return answer;
  } finally {
    reader.close();
  }
}
