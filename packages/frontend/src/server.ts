import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import type { ReviewResult } from "../../../contracts/index.js";
import type { FrontendServices } from "./workstream.js";

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function json(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(value));
}

async function reviewBody(request: IncomingMessage): Promise<{ cardId: string; result: ReviewResult }> {
  if (request.headers["content-type"]?.split(";")[0]?.trim() !== "application/json") {
    throw new HttpError(415, "Expected application/json");
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    size += Buffer.byteLength(chunk);
    if (size > 16_384) throw new HttpError(413, "Review body is too large");
    chunks.push(Buffer.from(chunk));
  }
  let input: unknown;
  try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new HttpError(400, "Invalid JSON"); }
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, "Invalid review");
  const { cardId, result } = input as Record<string, unknown>;
  if (typeof cardId !== "string" || !cardId.trim() || typeof result !== "string"
    || !["easy", "hard", "correct", "incorrect"].includes(result)) throw new HttpError(400, "Invalid review");
  return { cardId, result: result as ReviewResult };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".woff2": "font/woff2",
};

async function staticFile(path: string, root: string, response: ServerResponse, head: boolean) {
  let absoluteRoot: string;
  try { absoluteRoot = await realpath(root); }
  catch { throw new HttpError(503, "UI build missing. Run npm run build --workspace @flashlearn/frontend."); }
  const candidate = resolve(absoluteRoot, `.${path === "/" ? "/index.html" : path}`);
  try {
    const target = await realpath(candidate);
    const within = relative(absoluteRoot, target);
    if (within.startsWith(`..${sep}`) || within === ".." || isAbsolute(within)) throw new HttpError(404, "Not found");
    const type = MIME[extname(target)];
    if (!type) throw new HttpError(404, "Not found");
    const bytes = await readFile(target);
    response.writeHead(200, { "content-type": type, "cache-control": "no-cache", "x-content-type-options": "nosniff" });
    response.end(head ? undefined : bytes);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (["ENOENT", "EISDIR", "ENOTDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) throw new HttpError(404, "Not found");
    throw error;
  }
}

export function createWebServer(services: FrontendServices, webRoot: string) {
  return createServer(async (request, response) => {
    try {
      let path: string;
      try { path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname); }
      catch { throw new HttpError(400, "Invalid URL"); }
      if (request.method === "GET" && path === "/api/cards") return json(response, 200, await services.listCards());
      if (request.method === "GET" && path === "/api/cards/next") {
        const card = await services.nextCard();
        if (!card) throw new HttpError(404, "No card is due");
        return json(response, 200, { id: card.id, question: card.question, source: card.source });
      }
      const match = path.match(/^\/api\/cards\/([^/]+)$/);
      if (request.method === "GET" && match?.[1]) {
        const card = await services.getCard(match[1]);
        if (!card) throw new HttpError(404, "Card not found");
        return json(response, 200, card);
      }
      if (request.method === "POST" && path === "/api/review") {
        const { cardId, result } = await reviewBody(request);
        if (!await services.getCard(cardId)) throw new HttpError(404, "Card not found");
        return json(response, 200, await services.submitReview(cardId, result));
      }
      if (path === "/api" || path.startsWith("/api/")) throw new HttpError(404, "Not found");
      if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "Method not allowed");
      return await staticFile(path, webRoot, response, request.method === "HEAD");
    } catch (error) {
      if (!response.headersSent) json(response, error instanceof HttpError ? error.status : 500,
        { error: error instanceof HttpError ? error.message : "Unable to complete request" });
      else response.end();
    }
  });
}
