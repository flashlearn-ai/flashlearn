import { createServer, type Server } from "node:http";
import type { CardPreview, ReviewResult } from "../../../contracts/index.js";
import type { FrontendServices } from "./workstream.js";

export { FrontendService, MockFrontendServices } from "./workstream.js";
export type { FrontendServices, FrontendWorkstream } from "./workstream.js";

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>FlashLearn</title><style>body{font:18px system-ui;max-width:42rem;margin:12vh auto;padding:1rem;background:#f4f1e8;color:#17251d}button{font:inherit;padding:.6rem 1rem}small{color:#59665e}</style></head><body><main><small id="source"></small><h1 id="question">Loading...</h1><p id="answer" hidden></p><button id="reveal">Reveal answer</button></main><script>let card;async function next(){card=await fetch('/api/cards/next').then(r=>r.json());question.textContent=card.question||card.error;source.textContent=card.source?card.source.path+' @ '+card.source.sha.slice(0,7):''}reveal.onclick=async()=>{card=await fetch('/api/cards/'+card.id).then(r=>r.json());answer.textContent=card.answer;answer.hidden=false;reveal.hidden=true};next()</script></body></html>`;

function json(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function body(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createFlashLearnServer(services: FrontendServices): Server {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return response.end(PAGE);
      }
      if (request.method === "GET" && url.pathname === "/api/cards") return json(response, 200, await services.listCards());
      if (request.method === "GET" && url.pathname === "/api/cards/next") {
        const card = await services.nextCard();
        if (!card) return json(response, 404, { error: "No card is due" });
        const preview: CardPreview = { id: card.id, question: card.question, source: card.source };
        return json(response, 200, preview);
      }
      const cardMatch = url.pathname.match(/^\/api\/cards\/([^/]+)$/);
      if (request.method === "GET" && cardMatch?.[1]) {
        const card = await services.getCard(decodeURIComponent(cardMatch[1]));
        return card ? json(response, 200, card) : json(response, 404, { error: "Card not found" });
      }
      if (request.method === "POST" && url.pathname === "/api/review") {
        const input = await body(request) as { cardId?: string; result?: ReviewResult };
        const results: ReviewResult[] = ["easy", "hard", "correct", "incorrect"];
        if (!input.cardId || !input.result || !results.includes(input.result)) return json(response, 400, { error: "Invalid review" });
        return json(response, 200, await services.submitReview(input.cardId, input.result));
      }
      return json(response, 404, { error: "Not found" });
    } catch (error) {
      return json(response, 500, { error: error instanceof Error ? error.message : "Unknown error" });
    }
  });
}
