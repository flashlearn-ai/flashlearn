import { useEffect, useRef, useState } from "react";
import type { Card, ReviewResult } from "../../../../../contracts/index";
import { nextCard, revealCard } from "../lib/live";
import { submitReview } from "../lib/review";
import { SESSION_LIMIT, classify, dealCard, type Choice, type Presentation, type SessionCard, type StudyCard } from "../lib/deck";
import { BotMessage } from "./Chat";
import { FlashCard, PresentationChoice } from "./Flow";

type Action = "next" | "review";

/** The HTTP contract selects one due card, with no topic/exclusion filter. Never
 *  manufacture a client queue or skip a due card by grading it behind the scenes.
 *
 *  How a due card is *asked* is a presentation decision, not the schedule's, so
 *  each one is dealt through `dealSession` exactly like a topic session: some
 *  arrive as multiple choice, some as recall. Answers come from the deck the
 *  client already loaded; `GET /api/cards/:id` still fetches a card that became
 *  due after that load. */
export function LiveSession({ deck, studyDeck, presentation, onPresentation, onReviewed, onChooseTopics }: {
  deck: Card[];
  studyDeck: StudyCard[];
  presentation: Presentation;
  onPresentation: (mode: Presentation) => void;
  onChooseTopics: () => void;
  onReviewed: (card: Card, result: ReviewResult) => void;
}) {
  const [entries, setEntries] = useState<SessionCard[]>([]);
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

  /** Replaces the card under review, which is always the last one dealt. */
  function updateActive(change: (entry: SessionCard) => SessionCard) {
    setEntries((previous) => previous.map((entry, i) => (i === previous.length - 1 ? change(entry) : entry)));
  }

  function loadNext(fresh = false) {
    void run("next", async () => {
      const preview = await nextCard();
      if (!preview) {
        if (fresh) setEntries([]);
        setCompletion("No cards are due right now. Your saved reviews determine when they return.");
        setPhase("done");
        return;
      }
      // A card generated since the deck loaded is not in it, so fetch that one.
      const known = studyDeck.find((entry) => entry.id === preview.id);
      const study = known ?? classify([...deck, await revealCard(preview.id)]).at(-1)!;
      // Dealing shuffles, so it runs once here rather than inside the updater:
      // React invokes updaters twice in development to surface impurity, and
      // `run()` already serialises this call, so the rendered length is current.
      const dealt = dealCard(study, deck, presentation, fresh ? 0 : entries.length);
      setEntries((previous) => (fresh ? [dealt] : [...previous, dealt]));
      setPhase("running");
    });
  }

  const active = entries.at(-1);
  function choose(answer: Choice) {
    if (!active || active.answer || active.grade) return;
    updateActive((entry) => ({ ...entry, answer }));
  }

  function grade(result: ReviewResult) {
    if (!active || active.outcome?.recorded) return;
    const card = active.card;
    void run("review", async () => {
      updateActive((entry) => ({ ...entry, grade: result, outcome: null }));
      const outcome = await submitReview(card.id, result);
      updateActive((entry) => ({ ...entry, outcome }));
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
      <b>Live study</b><p>The server picks your next due card. Answer it or recall it, then rate how it went. Up to {SESSION_LIMIT} reviews per session; saved schedules survive reloads.</p>
      <p>Incorrect cards may be due again immediately.</p>
      {phase === "ready" && <>
        <PresentationChoice value={presentation} onChange={onPresentation} />
        <button className="start" disabled={busy !== null} onClick={() => loadNext(true)}>Start due review</button>
      </>}
    </div></BotMessage>
    {entries.map((entry, index) => <BotMessage key={`${index}-${entry.card.id}`}>
      <FlashCard
        entry={entry}
        index={index}
        total={SESSION_LIMIT}
        current={index === entries.length - 1 && phase === "running"}
        onChoose={choose}
        onGrade={grade}
      />
    </BotMessage>)}
    {active?.outcome?.recorded && phase === "running" && (
      <BotMessage><button className="start" disabled={busy !== null} onClick={() => loadNext()}>Next due card</button></BotMessage>
    )}
    {busy === "next" && <BotMessage><p role="status">Checking due cards…</p></BotMessage>}
    {error && <BotMessage><div role="alert" className="bubble">
      <p>{error.message}</p>
      {/* A failed rating is retried on the card itself, which owns the grade
        * that failed. Offering a second button here would be two controls for
        * one action. Fetching the next card has no card to host it. */}
      {error.action === "next" && (
        <button className="start" disabled={busy !== null} onClick={() => loadNext(phase !== "running")}>Retry due cards</button>
      )}
    </div></BotMessage>}
    {phase === "done" && <BotMessage><div className="bubble">
      <p role="status">{completion}</p>
      <button className="start" disabled={busy !== null} onClick={() => loadNext(true)}>Check for due cards</button>
      {/* Picking the schedule must not be a one-way door. */}
      <button className="start" disabled={busy !== null} onClick={onChooseTopics}>Choose topics</button>
    </div></BotMessage>}
    <div ref={end} />
  </>;
}
