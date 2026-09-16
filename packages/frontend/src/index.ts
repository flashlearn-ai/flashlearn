import { createServer, type Server } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { CardPreview, ReviewResult } from "../../../contracts/index.js";
import type { FrontendServices, FrontendWorkstream } from "./workstream.js";

export { MockFrontendServices } from "./workstream.js";
export type { FrontendServices, FrontendWorkstream } from "./workstream.js";

/** The built Teams client. `npm run build --workspace @flashlearn/frontend` produces it. */
const CLIENT = fileURLToPath(new URL("../client/dist/", import.meta.url));

const TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const MISSING = `<!doctype html><meta charset="utf-8"><title>FlashLearn</title>
<body style="font:16px system-ui;max-width:34rem;margin:14vh auto;padding:1rem;background:#f4f1e8;color:#17251d">
<h1>Client not built</h1><p>Run <code>npm run build --workspace @flashlearn/frontend</code>, then reload.</p>`;

/** The built shell, re-read when the build changes underneath us.
 *
 *  `npm run demo` and any rebuild rewrite `client/dist` with freshly hashed asset
 *  names. Holding the old `index.html` would serve a page pointing at files that
 *  no longer exist, which a browser renders as a blank screen with nothing in
 *  the server log. Comparing mtime costs one `stat` and removes that class of
 *  failure entirely. */
let shell: { mtimeMs: number; html: string } | undefined;

/** The client shell the browser boots from. Built by Vite rather than written by
 *  hand, so this reads the artifact instead of composing HTML in TypeScript. */
export function renderPage(): string {
  const path = join(CLIENT, "index.html");
  try {
    const { mtimeMs } = statSync(path);
    if (shell?.mtimeMs !== mtimeMs) shell = { mtimeMs, html: readFileSync(path, "utf8") };
    return shell.html;
  } catch {
    return MISSING;
  }
}

function json(response: import("node:http").ServerResponse, status: number, value: unknown, body = true): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(body ? JSON.stringify(value) : undefined);
}

/** A review body is at most a few hundred bytes. Anything larger is not a client
 *  of this API, and buffering it unbounded would be the only way to grow memory
 *  from a request. Returns undefined for a body that is oversized or not JSON,
 *  which the caller reports as a bad request rather than a server fault. */
const MAX_BODY = 64 * 1024;

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) return undefined;
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

/** Serves a built file, or the client shell for a route the browser owns.
 *
 *  A miss on something that looks like a file is a 404, not the shell: serving
 *  HTML in answer to `/assets/index-abc.js` makes the browser refuse the script
 *  on its MIME check and render a blank page with no failing request to look at.
 *
 *  Containment is checked after resolving symlinks, not just by normalising the
 *  path string, so a link planted inside the build cannot read outside it. */
async function serveClient(response: import("node:http").ServerResponse, pathname: string, body: boolean): Promise<void> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }
  const relative = normalize(decoded).replace(/^([/\\]|\.\.)+/, "");
  const extension = extname(relative);

  if (relative && relative !== "index.html") {
    const file = await readContained(relative);
    if (file) {
      response.writeHead(200, { "content-type": TYPES[extension] ?? "application/octet-stream" });
      return void response.end(body ? file : undefined);
    }
    if (extension) return json(response, 404, { error: "Not found" }, body);
  }

  const html = renderPage();
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(body ? html : undefined);
}

/** Reads a file only if it resolves inside the built client. */
async function readContained(relative: string): Promise<Buffer | null> {
  try {
    const target = await realpath(join(CLIENT, relative));
    const root = await realpath(CLIENT);
    if (target !== root && !target.startsWith(root + sep)) return null;
    return await readFile(target);
  } catch {
    return null;
  }
}

const RESULTS: ReviewResult[] = ["easy", "hard", "correct", "incorrect"];

export function createFlashLearnServer(services: FrontendServices): Server {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      // HEAD answers exactly as GET does, without a body. Wait-for-server and
      // link-checking scripts probe with it, and 404 tells them the wrong thing.
      const body = request.method !== "HEAD";
      const method = request.method === "HEAD" ? "GET" : request.method;

      if (method === "GET" && url.pathname === "/api/cards") return json(response, 200, await services.listCards(), body);
      if (method === "GET" && url.pathname === "/api/cards/next") {
        const card = await services.nextCard();
        if (!card) return json(response, 404, { error: "No card is due" }, body);
        const preview: CardPreview = { id: card.id, question: card.question, source: card.source };
        return json(response, 200, preview, body);
      }
      const cardMatch = url.pathname.match(/^\/api\/cards\/([^/]+)$/);
      if (method === "GET" && cardMatch?.[1]) {
        const card = await services.getCard(decodeURIComponent(cardMatch[1]));
        return card ? json(response, 200, card, body) : json(response, 404, { error: "Card not found" }, body);
      }
      if (method === "POST" && url.pathname === "/api/review") {
        const input = await readJson(request);
        // Shape-checked before use: a malformed or absent body is the client's
        // fault, and reporting it as a server fault hid that during review.
        const review = input as { cardId?: unknown; result?: unknown } | null | undefined;
        const cardId = typeof review?.cardId === "string" ? review.cardId : null;
        const result = RESULTS.find((value) => value === review?.result);
        if (!cardId || !result) return json(response, 400, { error: "Invalid review" }, body);
        // An unknown card is a bad reference, not a broken server.
        if (!await services.getCard(cardId)) return json(response, 404, { error: "Card not found" }, body);
        return json(response, 200, await services.submitReview(cardId, result), body);
      }
      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return json(response, 404, { error: "Not found" }, body);
      if (method !== "GET") return json(response, 405, { error: "Method not allowed" }, body);
      return await serveClient(response, url.pathname, body);
    } catch (error) {
      return json(response, 500, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
}

/** The frontend workstream's entry point, bound to the implementations above. */
export class FrontendService implements FrontendWorkstream {
  createServer(services: FrontendServices): Server {
    return createFlashLearnServer(services);
  }

  renderPage(): string {
    return renderPage();
  }
}
