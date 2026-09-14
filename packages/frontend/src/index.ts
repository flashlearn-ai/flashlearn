import { createServer, type Server } from "node:http";
import type { CardPreview, ReviewResult } from "../../../contracts/index.js";
import type { FrontendServices } from "./workstream.js";

export { FrontendService, MockFrontendServices } from "./workstream.js";
export type { FrontendServices, FrontendWorkstream } from "./workstream.js";

const PAGE = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>FlashLearn</title>
  <style>
    :root{font-family:system-ui,sans-serif;color:#17251d;background:#f4f1e8}
    body{max-width:42rem;margin:8vh auto;padding:1rem}
    main{background:#fff;border:1px solid #d9d1c2;border-radius:1rem;padding:2rem;box-shadow:0 .5rem 2rem #17251d14}
    h1{font-size:clamp(1.6rem,5vw,2.4rem);line-height:1.2}
    button{font:inherit;padding:.65rem 1rem;border:1px solid #17251d;border-radius:.5rem;background:#17251d;color:#fff;cursor:pointer}
    button:disabled{cursor:not-allowed;opacity:.4}
    #answer{padding:1rem;border-left:.3rem solid #8b795e;background:#f4f1e8}
    #source,#position{display:block;color:#59665e;overflow-wrap:anywhere}
    #navigation{display:flex;justify-content:space-between;gap:1rem;margin-top:1.5rem}
    [hidden]{display:none!important}
  </style>
</head>
<body>
  <main>
    <small id="position" aria-live="polite">Loading cards...</small>
    <h1 id="question"></h1>
    <p id="answer" hidden></p>
    <button id="reveal" type="button" hidden>Reveal answer</button>
    <small id="source"></small>
    <div id="navigation" hidden>
      <button id="previous" type="button">Previous</button>
      <button id="next" type="button">Next</button>
    </div>
  </main>
  <script>
    const position = document.querySelector('#position');
    const question = document.querySelector('#question');
    const answer = document.querySelector('#answer');
    const source = document.querySelector('#source');
    const reveal = document.querySelector('#reveal');
    const navigation = document.querySelector('#navigation');
    const previous = document.querySelector('#previous');
    const next = document.querySelector('#next');
    let cards = [];
    let currentIndex = 0;

    function renderCard() {
      const card = cards[currentIndex];
      position.textContent = 'Card ' + (currentIndex + 1) + ' of ' + cards.length;
      question.textContent = card.question;
      source.textContent = 'Source: ' + card.source.path + ' @ ' + card.source.sha;
      answer.textContent = card.answer;
      answer.hidden = true;
      reveal.hidden = false;
      navigation.hidden = false;
      previous.disabled = currentIndex === 0;
      next.disabled = currentIndex === cards.length - 1;
    }

    async function loadCards() {
      try {
        const response = await fetch('/api/cards');
        if (!response.ok) throw new Error('Unable to load cards');
        cards = await response.json();
        if (cards.length === 0) {
          position.textContent = 'No cards available';
          return;
        }
        renderCard();
      } catch (error) {
        position.textContent = error instanceof Error ? error.message : 'Unable to load cards';
      }
    }

    reveal.addEventListener('click', () => {
      answer.hidden = false;
      reveal.hidden = true;
    });
    previous.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex -= 1;
        renderCard();
      }
    });
    next.addEventListener('click', () => {
      if (currentIndex < cards.length - 1) {
        currentIndex += 1;
        renderCard();
      }
    });

    loadCards();
  </script>
</body>
</html>`;

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
