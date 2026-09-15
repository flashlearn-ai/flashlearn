import { useEffect, useMemo, useRef, useState } from "react";
import { DECK } from "./data";
import { buildChoices, buildSet, groupByTopic, type Card, type Choice, type ReviewResult } from "./lib/deck";
import { ChatList, Conversation, Rail } from "./components/Teams";
import { DetailsPane } from "./components/DetailsPane";
import { BotMessage, FlashCard, Results, TopicChooser, Typing, UserMessage, Welcome } from "./components/Flow";

type Phase = "welcome" | "choosing" | "running" | "done";

export default function App() {
  const groups = useMemo(() => groupByTopic(DECK), []);
  const [phase, setPhase] = useState<Phase>("welcome");
  const [session, setSession] = useState<Card[]>([]);
  const [choicesList, setChoicesList] = useState<Choice[][]>([]);
  const [answers, setAnswers] = useState<(Choice | null)[]>([]);
  const [grades, setGrades] = useState<(ReviewResult | null)[]>([]);
  const [step, setStep] = useState(0);
  const [typing, setTyping] = useState(false);
  const [labels, setLabels] = useState("");
  const scroll = useRef<HTMLDivElement>(null);

  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight, behavior: "smooth" }); }, [step, phase, typing, answers, grades]);

  function start(ids: string[], label: string) {
    const set = buildSet(DECK, ids);
    setSession(set);
    setChoicesList(set.map((c) => buildChoices(c, DECK)));
    setAnswers(new Array(set.length).fill(null));
    setGrades(new Array(set.length).fill(null));
    setStep(0);
    setLabels(label);
    setPhase("running");
  }

  // pick a multiple-choice answer — reveals correct/wrong, then the grade buttons appear.
  function choose(choice: Choice) {
    setAnswers((a) => { const n = [...a]; n[step] = choice; return n; });
  }

  // submit the spaced-repetition grade — records it and advances to the next card.
  function grade(g: ReviewResult) {
    setGrades((gr) => { const n = [...gr]; n[step] = g; return n; });
    window.setTimeout(() => {
      setTyping(true);
      window.setTimeout(() => {
        setTyping(false);
        setStep((prev) => {
          const next = prev + 1;
          if (next >= session.length) setPhase("done");
          return next;
        });
      }, 650);
    }, 550);
  }

  function again() {
    setPhase("choosing");
    setSession([]);
    setAnswers([]);
    setGrades([]);
    setStep(0);
  }

  const lastVisible = Math.min(step, session.length - 1);

  return (
    <div className="stage">
      <div className="window">
        <Rail />
        <ChatList />
        <Conversation>
          <div className="messages" ref={scroll}>
            <div className="divider"><span>Today</span></div>

            {phase === "welcome" && (
              <BotMessage><Welcome cards={DECK.length} topics={groups.length} onStart={() => setPhase("choosing")} /></BotMessage>
            )}

            {phase !== "welcome" && (
              <>
                <BotMessage><span className="bubble">Welcome back, Sara. Pick the topics you want to study.</span></BotMessage>
                {phase === "choosing" && <BotMessage><TopicChooser groups={groups} total={DECK.length} onStart={start} /></BotMessage>}
                {(phase === "running" || phase === "done") && (
                  <>
                    <UserMessage text={labels} />
                    {session.slice(0, lastVisible + 1).map((card, i) => (
                      <BotMessage key={card.id}>
                        <FlashCard
                          card={card}
                          index={i}
                          total={session.length}
                          choices={choicesList[i]!}
                          chosen={answers[i] ?? null}
                          grade={grades[i] ?? null}
                          current={i === step}
                          onChoose={i === step ? choose : () => {}}
                          onGrade={i === step ? grade : () => {}}
                        />
                      </BotMessage>
                    ))}
                    {typing && <Typing />}
                    {phase === "done" && <BotMessage><Results session={session} answers={answers} grades={grades} onAgain={again} /></BotMessage>}
                  </>
                )}
              </>
            )}
          </div>
        </Conversation>
        <DetailsPane cards={DECK.length} topics={groups.length} />
      </div>
    </div>
  );
}
