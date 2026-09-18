import { dueLabel, scoreOf, type Run, type SessionCard } from "../lib/deck";
import type { TopicInsight } from "../lib/insights";
import { Mark } from "./Mark";
import { Ring } from "./Ring";
import { X } from "../icons";

export type Progress = {
  runs: Run[];
  cards: SessionCard[];
  done: boolean;
};

/** During a run the pane charts progress. After it, the same space becomes the
 *  summary — so the numbers outlive the chat canvas instead of scrolling away. */
function Session({ runs, cards, done }: Progress) {
  const total = cards.length;
  const answered = cards.filter((c) => c.answer).length;
  const correct = cards.filter((c) => c.answer?.correct).length;
  const current = runs.find((run) => run.cards.some((_, i) => !cards[run.start + i]?.answer));
  const missed = runs.flatMap((run) => run.cards.filter((_, i) => { const a = cards[run.start + i]?.answer; return a && !a.correct; }));
  // Counted from the dates the learning engine returned, not from a local table.
  const due = cards.map((c) => dueLabel(c.outcome?.due)).filter((label): label is string => label !== null);

  return (
    <>
      <div className="dsec">
        <h4>{done ? "Session complete" : "This session"}</h4>
        <div className="prog">
          <Ring value={answered} total={total} size={72}><b className="rval">{answered}/{total}</b></Ring>
          <p className="pline"><b>{correct} right</b>, {answered - correct} missed<br />{done ? "all cards reviewed" : `${total - answered} to go`}</p>
        </div>
        <div className="runs">
          {runs.map((run) => {
            const scored = run.cards.filter((_, i) => cards[run.start + i]?.answer);
            const hit = scoreOf(run, cards);
            const state = run === current ? " now" : scored.length === 0 ? " next" : "";
            return (
              <div className={`run${state}`} key={run.id}>
                <span className="lab">{run.label}</span>
                <span className="bars">
                  {run.cards.map((card, i) => {
                    const answer = cards[run.start + i]?.answer;
                    return <i key={card.id} className={answer ? (answer.correct ? "ok" : "no") : ""} />;
                  })}
                </span>
                <span className="sc">{scored.length === 0 ? "—" : `${hit}/${run.cards.length}`}</span>
              </div>
            );
          })}
        </div>
      </div>

      {done && (
        <>
          <div className="dsec">
            <h4>Coming back</h4>
            <div className="dstats">
              <div className="dstat"><b>{due.filter((d) => d === "today").length}</b><span>Today</span></div>
              <div className="dstat"><b>{due.filter((d) => d === "tomorrow").length}</b><span>Tomorrow</span></div>
              <div className="dstat"><b>{due.filter((d) => d !== "today" && d !== "tomorrow").length}</b><span>Later</span></div>
            </div>
          </div>
          {missed.length > 0 && (
            <div className="dsec">
              <h4>Weakest</h4>
              <div className="missed">
                {missed.slice(0, 4).map((card) => (
                  <div className="miss" key={card.id}>
                    <span className="mx"><X size={11} /></span>
                    <span className="mq">{card.question}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/** Teams-style right pane. Idle it introduces the app; mid-session it tracks the run. */
export function DetailsPane({ cards, topics, sources, progress, insights }: { cards: number; topics: number; sources: number; progress: Progress | null; insights: TopicInsight[] }) {
  return (
    <aside className="details">
      <div className="hero">
        <div className="mk"><Mark size={40} radius="14px 5px 14px 5px" /></div>
        <h3>FlashLearn</h3>
        <div className="by">Learning assistant · by the Coolest Team</div>
        <span className="pill"><span className="p" /> Available</span>
      </div>

      {progress ? <Session {...progress} /> : (
        <>
          <div className="dsec">
            <h4>About</h4>
            <p>Turns a repository, a folder, or a handful of documents into attributed flashcards, then quizzes you right here in chat. Every card cites the file it came from, and the commit too when there is one.</p>
          </div>
          <div className="dsec">
            <h4>How it works</h4>
            <div className="steps">
              <div className="step"><span className="n">1</span><span>Point it at a repository, a directory, or a set of docs — it extracts questions from the code and prose it finds.</span></div>
              <div className="step"><span className="n">2</span><span>Pick topics and answer, one card at a time.</span></div>
              <div className="step"><span className="n">3</span><span>It schedules reviews so the ones you miss come back.</span></div>
            </div>
          </div>
        </>
      )}

      <div className="dsec">
        <h4>Insights · this device</h4>
        {insights.length === 0 ? <p>No review history yet.</p> : (
          <div className="insights">
            {insights.map((insight) => (
              <div className="insight" key={insight.id}>
                <div className="insight-head">
                  <span>{insight.label}</span>
                  <b>{insight.successRate}%</b>
                </div>
                <span className="insight-track"><i style={{ width: `${insight.successRate}%` }} /></span>
                <small>{insight.attempts} attempt{insight.attempts === 1 ? "" : "s"} · {insight.easy} easy · {insight.hard + insight.incorrect} difficult</small>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="dsec">
        <h4>This deck</h4>
        <div className="dstats">
          <div className="dstat"><b>{cards}</b><span>Cards</span></div>
          <div className="dstat"><b>{topics}</b><span>Topics</span></div>
          <div className="dstat"><b>{sources}</b><span>Sources</span></div>
        </div>
      </div>
    </aside>
  );
}
