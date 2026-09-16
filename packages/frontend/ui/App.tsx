import { useEffect, useState } from "react";
import { createApiClient, type Card, type CardPreview, type ReviewResult, type ReviewState, type StudyClient } from "./client.js";
import { ChatList, Conversation, Rail } from "./components/Teams";
import { DetailsPane } from "./components/DetailsPane";
import { Mark } from "./components/Mark";

async function defaultClient(): Promise<StudyClient> {
  // Constant-folded at build time: live bundles contain no demo cards.
  return __DEMO__ ? (await import("./demo-client.js")).createDemoClient() : createApiClient();
}

const RESULTS: ReviewResult[] = ["incorrect", "hard", "correct", "easy"];

export default function App() {
  const [client, setClient] = useState<StudyClient>();
  const [deck, setDeck] = useState<Card[]>([]);
  const [current, setCurrent] = useState<CardPreview | null>(null);
  const [answer, setAnswer] = useState<Card | null>(null);
  const [receipt, setReceipt] = useState<ReviewState | null>(null);
  const [phase, setPhase] = useState<"welcome" | "study" | "empty">("welcome");
  const [reviewed, setReviewed] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setBusy(true);
    setError("");
    try {
      const nextClient = await defaultClient();
      const cards = await nextClient.list();
      setClient(nextClient);
      setDeck(cards);
      setCount(0);
      setPhase(cards.length ? "welcome" : "empty");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to load cards");
    } finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);

  async function act(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : "Request failed. Try again."); }
    finally { setBusy(false); }
  }

  const next = () => act(async () => {
    const card = await client!.next();
    setCurrent(card);
    setAnswer(null);
    setReceipt(null);
    setReviewed(false);
    setPhase(card ? "study" : "empty");
  });

  const reveal = () => act(async () => { setAnswer(await client!.reveal(current!.id)); });
  const grade = (result: ReviewResult) => act(async () => {
    const state = await client!.review(current!.id, result);
    setReceipt(state);
    setReviewed(true);
    setCount((value) => value + 1);
  });

  const topics = new Set(deck.flatMap((card) => card.tags ?? []));
  const sources = new Set(deck.map((card) => card.source.path));
  return (
    <div className="stage">
      <div className="window">
        <Rail /><ChatList />
        <Conversation>
          <div className="messages study-content">
            <div className="mode-label">{__DEMO__ ? "Web demo · sample data only · session progress resets on reload" : "Local project · reviews saved to .flashlearn"}</div>
            {error && <div role="alert" className="study-error">{error}{!client && <button onClick={() => void load()}>Retry loading</button>}</div>}
            {busy && <p role="status">Loading…</p>}
            {client && phase === "welcome" && <div className="welcome"><div className="inner">
              <Mark size={48} /><h2>Learn your codebase,<br />one question at a time.</h2>
              <p>{deck.length} cards available. {__DEMO__ ? "These hand-authored examples reference an imaginary sample repository." : "Review order and due dates come from your learning engine."}</p>
              <button className="cta" disabled={busy} onClick={next}>Get started</button>
            </div></div>}
            {phase === "study" && current && <article className="qcard" aria-label="Study card">
              <div className="qtop"><span className="qbrand"><Mark /> FlashLearn</span><span>{count} reviewed this session</span></div>
              <h2 className="qtext">{current.question}</h2>
              {!answer && <button className="start" disabled={busy} onClick={reveal}>Reveal answer</button>}
              {answer && <><div className="study-answer">{answer.answer}</div>
                {!reviewed && <div className="grade"><h3>How well did you recall it?</h3><div className="grade-btns">
                  {RESULTS.map((result) => <button className="g" key={result} disabled={busy} onClick={() => void grade(result)}>{result[0].toUpperCase() + result.slice(1)}</button>)}
                </div></div>}
              </>}
              {reviewed && <div role="status" className="graded">
                {__DEMO__ ? "Demo rating recorded for this session only." : `Review saved.${receipt?.nextReview ? ` Next review: ${new Date(receipt.nextReview).toLocaleString()}` : ""}`}
              </div>}
              {reviewed && <button className="start" disabled={busy} onClick={next}>Next card</button>}
              <div className="study-source">{__DEMO__ ? "Sample source" : "Source"}: <code>{current.source.path}</code> @ <code>{current.source.sha}</code></div>
            </article>}
            {client && phase === "empty" && <section className="welcome"><div className="inner">
              <h2>{deck.length ? (__DEMO__ ? "Demo complete" : "No cards due") : "No cards yet"}</h2>
              <p>{__DEMO__ ? "Try another session with the public sample deck." : deck.length ? "All available reviews are scheduled for later. Come back when they are due." : "Run flashlearn generate for your project, then reload this page."}</p>
              <p>{count} reviewed this session</p>
              <button className="cta" disabled={busy} onClick={() => void load()}>{__DEMO__ ? "Restart demo" : "Reload cards"}</button>
            </div></section>}
          </div>
        </Conversation>
        <DetailsPane cards={deck.length} topics={topics.size} sources={sources.size} demo={__DEMO__} />
      </div>
    </div>
  );
}
