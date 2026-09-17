import { useEffect, useMemo, useRef, useState } from "react";
import { deckSource } from "./deckSource";
import { submitReview } from "./lib/review";
import { SESSION_LIMIT, buildSet, classify, dealSession, groupByTopic, runsOf, scoreOf, type Card, type Choice, type ReviewResult, type SessionCard } from "./lib/deck";
import { ChatList, Conversation, Rail } from "./components/Teams";
import { DetailsPane, type Progress } from "./components/DetailsPane";
import { BotMessage, Typing, UserMessage } from "./components/Chat";
import { EmptyDeck, FlashCard, Results, TopicChooser, TopicHandoff, Welcome } from "./components/Flow";

type Phase = "welcome" | "choosing" | "running" | "done";

export default function App() {
  const [deck, setDeck] = useState<Card[]>([]);
  // Surfaced rather than silently swapped for the fixture, so a misconfigured
  // API is obvious instead of looking like the sample deck was intended.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Computed from the whole deck, never from a session subset: a subset shares a
  // deeper path prefix, which would group its cards differently to the chooser.
  // Classified once, here, so every downstream view agrees on a card's topic.
  const studyDeck = useMemo(() => classify(deck), [deck]);
  const groups = useMemo(() => groupByTopic(studyDeck), [studyDeck]);
  const sources = useMemo(() => new Set(deck.map((c) => c.source.path)).size, [deck]);
  const [phase, setPhase] = useState<Phase>("welcome");
  const [cards, setCards] = useState<SessionCard[]>([]);
  const [step, setStep] = useState(0);
  // Identifies the live session. A ref, not state: the comparison happens when a
  // review resolves, and a state value captured in that closure is the one from
  // the render that started the request, which can never differ from itself.
  const liveSession = useRef(0);
  // How many sessions have run, so each one starts further into every topic.
  const [sessionsRun, setSessionsRun] = useState(0);
  const [typing, setTyping] = useState(false);
  const [labels, setLabels] = useState("");
  const scroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    deckSource()()
      .then((cards) => { if (!cancelled) setDeck(cards); })
      .catch((error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" }); }, [step, phase, typing, cards]);

  function start(ids: string[], label: string) {
    setCards(dealSession(buildSet(studyDeck, ids, SESSION_LIMIT, sessionsRun), deck));
    setStep(0);
    setLabels(label);
    liveSession.current += 1;
    setSessionsRun((n) => n + 1);
    setPhase("running");
  }

  // pick a multiple-choice answer — reveals correct/wrong, then the grade buttons appear.
  function choose(answer: Choice) {
    setCards((c) => c.map((entry, i) => (i === step ? { ...entry, answer } : entry)));
  }

  // submit the spaced-repetition grade — records it and advances to the next card.
  function grade(g: ReviewResult) {
    const entry = cards[step];
    const at = step;
    const startedIn = liveSession.current;
    if (entry) {
      void submitReview(entry.card.id, g).then((outcome) => {
        if (startedIn !== liveSession.current) return;
        setCards((c) => c.map((item, i) => (i === at ? { ...item, outcome } : item)));
      });
    }
    // A deck too small to offer a wrong choice shows the answer instead of asking,
    // so nothing was ever chosen. Grading one is the completion signal: without
    // this its run stays "in progress" after the session ends and scores zero.
    setCards((c) => c.map((item, i) => (
      i === step ? { ...item, grade: g, answer: item.answer ?? item.choices.find((choice) => choice.correct) ?? null } : item
    )));
    window.setTimeout(() => {
      setTyping(true);
      window.setTimeout(() => {
        setTyping(false);
        setStep((prev) => {
          const next = prev + 1;
          if (next >= cards.length) setPhase("done");
          return next;
        });
      }, 650);
    }, 550);
  }

  // start() resets every session value, and nothing renders them while choosing.
  function again() {
    setPhase("choosing");
  }

  // A live project that generated nothing has no session to offer. Distinct from
  // still loading, and distinct from a deck that failed to load.
  const empty = !loading && loadError === null && deck.length === 0;
  const runs = useMemo(() => runsOf(cards.map((c) => c.card)), [cards]);
  const progress: Progress | null = phase === "running" || phase === "done"
    ? { runs, cards, done: phase === "done" }
    : null;

  /** A run is announced once its first card is reachable, and carries the score
   *  of the run it replaces — so the transition is a message, not a divider. */
  function handoff(index: number) {
    const at = runs.findIndex((run) => run.start === index);
    if (at < 0) return null;
    const previous = runs[at - 1];
    const done = previous
      ? { label: previous.label, total: previous.cards.length, correct: scoreOf(previous, cards) }
      : null;
    return <BotMessage key={`run-${runs[at]!.id}`}><TopicHandoff done={done} next={runs[at]!} /></BotMessage>;
  }

  return (
    <div className="stage">
      <div className="window">
        <Rail />
        <ChatList />
        <Conversation>
          <div className="messages" ref={scroll}>
            <div className="divider"><span>Today</span></div>
            {import.meta.env.MODE === "demo" && <p role="note">Public sample demo · ratings last for this session only and reset on reload. No project or API is accessed.</p>}

            {loadError !== null && (
              <BotMessage><span className="bubble">Could not load the deck: {loadError}</span></BotMessage>
            )}

            {loading && <BotMessage><span className="bubble">Loading cards…</span></BotMessage>}

            {empty && <BotMessage><EmptyDeck /></BotMessage>}

            {!loading && loadError === null && !empty && phase === "welcome" && (
              <BotMessage><Welcome cards={deck.length} topics={groups.length} onStart={() => setPhase("choosing")} /></BotMessage>
            )}

            {!loading && loadError === null && !empty && phase !== "welcome" && (
              <>
                <BotMessage><span className="bubble">Welcome back, Sara. Pick the topics you want to study.</span></BotMessage>
                {phase === "choosing" && <BotMessage><TopicChooser groups={groups} total={deck.length} onStart={start} /></BotMessage>}
                {(phase === "running" || phase === "done") && (
                  <>
                    <UserMessage text={labels} />
                    {cards.slice(0, step + 1).map((entry, i) => (
                      <div key={entry.card.id}>
                        {handoff(i)}
                        <BotMessage>
                          <FlashCard
                            entry={entry}
                            index={i}
                            total={cards.length}
                            current={i === step}
                            onChoose={choose}
                            onGrade={grade}
                          />
                        </BotMessage>
                      </div>
                    ))}
                    {typing && <Typing />}
                    {phase === "done" && <BotMessage><Results cards={cards} onAgain={again} /></BotMessage>}
                  </>
                )}
              </>
            )}
          </div>
        </Conversation>
        <DetailsPane cards={deck.length} topics={groups.length} sources={sources} progress={progress} />
      </div>
    </div>
  );
}
