import { FrontendService } from "../../src/index.js";
import { DEMO_CARDS } from "./demo.js";

const demo = process.argv.includes("--demo");
let reviewed = false;
const card = { ...DEMO_CARDS[0]!, id: "live-test", question: "Live API question?", answer: "Live API answer." };
const server = new FrontendService(demo ? "dist/demo" : "dist/web").createServer({
  listCards: async () => [card],
  nextCard: async () => reviewed ? null : card,
  getCard: async (id) => id === card.id ? card : null,
  submitReview: async (cardId) => {
    reviewed = true;
    return { cardId, easeFactor: 2.5, intervalDays: 8, reviewCount: 1, correctCount: 1, nextReview: "2030-02-01T00:00:00.000Z" };
  },
});
// Simulate GitHub's repository subpath to catch absolute asset URL mistakes.
if (demo) server.prependListener("request", (request) => { request.url = request.url?.replace(/^\/flashlearn(?=\/)/, ""); });
server.listen(demo ? 4176 : 4175, "127.0.0.1");
process.on("SIGTERM", () => server.close());
