import { useEffect, useRef, useState } from "react";
import type { Card, CardPreview, ReviewResult } from "../../../../../contracts/index";
import { nextCard, revealCard } from "../lib/live";
import { submitReview, type ReviewOutcome } from "../lib/review";
import { dueLabel, SESSION_LIMIT } from "../lib/deck";
import { BotMessage } from "./Chat";

type Entry = { preview: CardPreview; card?: Card; result?: ReviewResult; outcome?: ReviewOutcome };
type Action = "next" | "reveal" | "review";

/** The HTTP contract selects one due card, with no topic/exclusion filter. Never
 * manufacture a client queue or skip a due card by grading it behind the scenes. */
export function LiveSession({ onReviewed }: { onReviewed: (card: Card, result: ReviewResult) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<{ action: Action; message: string } | null>(null);
  const [completion, setCompletion] = useState("");
  // Synchronous guard prevents duplicate requests before React commits a render.
  const pending = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [entries, phase, busy, error]);

  async function run(action: Action, task: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(action);
    setError(null);
    try { await task(); }
    catch (reason) {
      setError({ action, message: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  function loadNext(fresh = false) {
    void run("next", async () => {
      const preview = await nextCard();
      if (fresh) setEntries([]);
      if (!preview) {
        setCompletion("No cards are due right now. Your saved reviews determine when they return.");
        setPhase("done");
        return;
      }
      setEntries((previous) => [...(fresh ? [] : previous), { preview }]);
      setPhase("running");
    });
  }

  const active = entries.at(-1);
  function reveal() {
    if (!active || active.card) return;
    void run("reveal", async () => {
      const card = await revealCard(active.preview.id);
      setEntries((previous) => previous.map((entry, i) => i === previous.length - 1 ? { ...entry, card } : entry));
    });
  }

  function grade(result: ReviewResult) {
    if (!active?.card || active.outcome?.recorded) return;
    const card = active.card;
    void run("review", async () => {
      setEntries((previous) => previous.map((entry, i) => i === previous.length - 1 ? { ...entry, result, outcome: undefined } : entry));
      const outcome = await submitReview(active.preview.id, result);
      setEntries((previous) => previous.map((entry, i) => i === previous.length - 1 ? { ...entry, result, outcome } : entry));
      if (!outcome.recorded) throw new Error("Save not confirmed. Check your connection and retry this rating. If the response was lost, the server may already have saved it.");
      onReviewed(card, result);
      if (entries.length >= SESSION_LIMIT) {
        setCompletion(`Session complete · ${SESSION_LIMIT} reviews saved.`);
        setPhase("done");
      }
    });
  }

  return <>
    <BotMessage><div className="bubble">
      <b>Live study</b><p>The server picks your next due card. Recall the answer, reveal it, then rate your recall. Up to {SESSION_LIMIT} reviews per session; saved schedules survive reloads.</p>
      <p>Incorrect cards may be due again immediately.</p>
      {phase === "ready" && <button className="start" disabled={busy !== null} onClick={() => loadNext(true)}>Start due review</button>}
    </div></BotMessage>
    {entries.map((entry, index) => <BotMessage key={`${index}-${entry.preview.id}`}>
      <div className="qcard">
        <div className="qmeta">Review {index + 1} · up to {SESSION_LIMIT}</div>
        <p className="qtext">{entry.preview.question}</p>
        <p className="qsrc">{entry.preview.source.path}{entry.preview.source.sha !== "unknown" && ` @${entry.preview.source.sha.slice(0, 7)}`}</p>
        {entry.card && <p className="lone">{entry.card.answer}</p>}
        {index === entries.length - 1 && phase === "running" && <>
          {!entry.card && <button className="start" disabled={busy !== null} onClick={reveal}>Reveal answer</button>}
          {entry.card && !entry.result && <div className="grade">
            <div className="grade-q">How well did you recall it?</div>
            <div className="grade-btns">
              {(["incorrect", "hard", "correct", "easy"] as const).map((result) => <button className="g" key={result} disabled={busy !== null} onClick={() => grade(result)}>{result[0]!.toUpperCase() + result.slice(1)}</button>)}
            </div>
          </div>}
          {entry.outcome?.recorded && <button className="start" disabled={busy !== null} onClick={() => loadNext()}>Next due card</button>}
        </>}
        {entry.result && <p className="graded" role="status">{entry.outcome?.recorded
          ? entry.outcome.due ? `Scheduled · comes back ${dueLabel(entry.outcome.due)}` : "Review saved · no due date returned"
          : busy === "review" && index === entries.length - 1 ? "Saving review…" : "Save not confirmed"}</p>}
      </div>
    </BotMessage>)}
    {busy && busy !== "review" && <BotMessage><p role="status">{busy === "reveal" ? "Revealing answer…" : "Checking due cards…"}</p></BotMessage>}
    {error && <BotMessage><div role="alert" className="bubble">
      <p>{error.message}</p>
      <button className="start" disabled={busy !== null} onClick={() => {
        if (error.action === "review" && active?.result) grade(active.result);
        else if (error.action === "reveal") reveal();
        else loadNext(phase !== "running");
      }}>Retry {error.action === "review" ? "save" : error.action === "reveal" ? "reveal" : "due cards"}</button>
    </div></BotMessage>}
    {phase === "done" && <BotMessage><div className="bubble">
      <p role="status">{completion}</p>
      <button className="start" disabled={busy !== null} onClick={() => loadNext(true)}>Check for due cards</button>
    </div></BotMessage>}
    <div ref={end} />
  </>;
}
