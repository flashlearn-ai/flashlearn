import { useState, type CSSProperties } from "react";
import { SESSION_LIMIT, dueLabel, type Choice, type ReviewResult, type Run, type SessionCard, type TopicGroup } from "../lib/deck";
import { EXCERPTS, TOPIC_META, type TopicIcon } from "../data";
import { Arrow, Check, ChevronDown, Database, File, FileText, Repeat, Terminal, X } from "../icons";
import { Mark } from "./Mark";
import { Ring } from "./Ring";

const GLYPH: Record<TopicIcon, (p: { size?: number }) => JSX.Element> = { terminal: Terminal, database: Database, repeat: Repeat, file: FileText };

export function Welcome({ onStart, cards, topics }: { onStart: () => void; cards: number; topics: number }) {
  return (
    <div className="welcome">
      <div className="inner">
        <div className="mk"><Mark size={40} radius="14px 5px 14px 5px" /></div>
        <h2>Study what you are<br />onboarding to, in Teams.</h2>
        <p>FlashLearn turned your sources into {cards.toLocaleString()} cards across {topics} topics — each one cites the exact file it came from.</p>
        <button className="cta" onClick={onStart}>Get started<Arrow size={16} /></button>
        <div className="meta"><span><b>{cards.toLocaleString()}</b> cards</span><span><b>{topics}</b> topics</span><span><b>{SESSION_LIMIT}</b> per session</span></div>
      </div>
    </div>
  );
}

/** A generated project with nothing in it. Saying so beats an empty topic list. */
export function EmptyDeck() {
  return (
    <div className="welcome">
      <div className="inner">
        <div className="mk"><Mark size={40} radius="14px 5px 14px 5px" /></div>
        <h2>No cards yet.</h2>
        <p>This project has been initialised but nothing has been generated from it, or the files it holds have no documentation to draw questions from.</p>
        <pre className="cmd">flashlearn generate</pre>
      </div>
    </div>
  );
}

export function TopicChooser({ groups, total, onStart }: { groups: TopicGroup[]; total: number; onStart: (ids: string[], labels: string) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = sel.size === groups.length;
  const selectAll = () => setSel(allOn ? new Set() : new Set(groups.map((g) => g.id)));
  const available = groups.filter((g) => sel.has(g.id)).reduce((n, g) => n + g.total, 0);
  const count = Math.min(available, SESSION_LIMIT);
  const start = () => onStart([...sel], groups.filter((g) => sel.has(g.id)).map((g) => g.label).join(", "));

  return (
    <div className="pick">
      <div className="pick-head">
        <div><span className="t">Choose topics</span><span className="psub">{groups.length} topics · {total.toLocaleString()} cards</span></div>
        <button className="selall" onClick={selectAll}>{allOn ? "Clear" : "Select all"}</button>
      </div>
      <div className="pick-body">
        <div className="topics">
          {groups.map((g) => {
            const meta = TOPIC_META[g.id] ?? { accent: "#12965a", icon: "file" as TopicIcon };
            const Glyph = GLYPH[meta.icon];
            const on = sel.has(g.id);
            return (
              <button key={g.id} className={`topic${on ? " sel" : ""}`} style={{ "--a": meta.accent } as CSSProperties} onClick={() => toggle(g.id)}>
                <span className="tglyph"><Glyph size={17} /></span>
                <span className="tmain">
                  <span className="tlabel">{g.label}</span>
                  {/* Card count only. No endpoint reports mastery, so none is claimed. */}
                  <span className="tmastery"><em>{g.total.toLocaleString()} card{g.total === 1 ? "" : "s"}</em></span>
                </span>
                <span className="tcheck">{on && <Check size={14} />}</span>
              </button>
            );
          })}
        </div>
        <button className="start" disabled={count === 0} onClick={start}>
          {count === 0 ? "Select a topic to begin" : `Start · ${count} question${count === 1 ? "" : "s"}`}<Arrow size={16} />
        </button>
        {available > count && <p className="capped">{available.toLocaleString()} cards match — this session takes {count}, spread across the topics you picked.</p>}
      </div>
    </div>
  );
}

const LETTERS = ["A", "B", "C"];

export function FlashCard({ entry, index, total, current, onChoose, onGrade }: {
  entry: SessionCard; index: number; total: number; current: boolean;
  onChoose: (c: Choice) => void; onGrade: (g: ReviewResult) => void;
}) {
  const { card, choices, answer: chosen, grade, outcome } = entry;
  const answered = chosen !== null;
  // Only the sample deck ships excerpts; a live card resolves to undefined and
  // the source panel shows attribution without a snippet.
  const ex = EXCERPTS[card.id];
  const missed = answered && !chosen.correct;
  // A deck can be too small to draw a wrong answer from. Offering one option and
  // calling it a quiz is a test nobody can fail, so the card just states itself.
  const quiz = choices.length > 1;
  const settled = answered || !quiz;
  // On a miss the evidence opens itself — the source is the explanation, so it
  // shouldn't need a click. A correct answer leaves it folded.
  const [opened, setOpened] = useState<boolean | null>(null);
  const open = opened ?? (missed && Boolean(ex));
  // Resolved when the session was dealt, not by scanning the deck on each render.
  const confused = chosen ? entry.confusable.get(chosen.text) ?? null : null;
  // Attribution without a repository has no commit to cite.
  const sha = card.source.sha && card.source.sha !== "unknown" ? card.source.sha : null;
  const due = dueLabel(outcome?.due);

  return (
    <div className="qcard">
      <div className="qtop">
        <span className="qbrand"><span className="m"><Mark size={16} radius="6px 2px 6px 2px" /></span> FlashLearn</span>
      </div>
      <div className="qmeta">
        <span className="frac">{index + 1} / {total}</span>
        <span className="qseg">{Array.from({ length: total }, (_, i) => <i key={i} className={i < index ? "done" : i === index ? "cur" : ""} />)}</span>
      </div>
      <p className="qtext">{card.question}</p>
      {!quiz ? <p className="lone">{card.answer}</p> : (
      <div className="qchoices">
        {choices.map((c, i) => {
          const cls = !answered ? "" : c.correct ? " correct" : c === chosen ? " wrong" : " dim";
          return (
            <button key={i} className={`qchoice${cls}`} disabled={answered} onClick={() => { if (current) onChoose(c); }}>
              <span className="k">{LETTERS[i]}</span><span className="qc-text">{c.text}</span>
              {answered && c.correct && <span className="qc-mark ok"><Check size={13} /></span>}
              {answered && !c.correct && c === chosen && <span className="qc-mark no"><X size={13} /></span>}
            </button>
          );
        })}
      </div>
      )}

      <button className={`qsrc${open ? " open" : ""}`} onClick={() => setOpened(!open)}>
        <File size={11} />{card.source.path} {sha && <span className="sha">@{sha.slice(0, 7)}</span>}
        <ChevronDown size={13} className="chev" />
      </button>
      {open && ex && (
        <div className="qcode">
          <div className="qcode-h"><Check size={12} className="g" /> generated from this source · {ex.lines}</div>
          <pre>{ex.code}</pre>
        </div>
      )}

      {confused && chosen && (
        <p className="confused">
          You picked <b>{chosen.text}</b> — that answers &ldquo;{confused.question}&rdquo;
        </p>
      )}

      {settled && !grade && current && (!quiz || chosen?.correct ? (
        <div className="grade">
          <div className="grade-q">How did that go?</div>
          <div className="grade-btns">
            <button className="g g-hard" onClick={() => onGrade("hard")}>Hard</button>
            <button className="g g-easy" onClick={() => onGrade("easy")}>Easy</button>
          </div>
        </div>
      ) : (
        <div className="grade">
          <div className="grade-q">You&rsquo;ll see this one again soon.</div>
          <button className="g-primary" onClick={() => onGrade("incorrect")}>Continue<Arrow size={15} /></button>
        </div>
      ))}
      {grade && (
        <div className={`graded${outcome && !outcome.recorded ? " unrecorded" : ""}`}>
          {outcome && !outcome.recorded
            ? "Not recorded — the server rejected this review."
            : due ? `Scheduled · comes back ${due}` : "Scheduled"}
        </div>
      )}

    </div>
  );
}

/** The seam between two topic runs. A conversation marks a change of subject by
 *  saying so, not with a rule — and the sentence carries the score just closed. */
export function TopicHandoff({ done, next }: { done: { label: string; correct: number; total: number } | null; next: Run }) {
  const cards = `${next.cards.length} card${next.cards.length === 1 ? "" : "s"}`;
  return (
    <span className="bubble">
      {done
        ? <>That&rsquo;s <b>{done.label}</b> done — {done.correct} of {done.total}. Next up: <b>{next.label}</b>, {cards}.</>
        : <>Starting with <b>{next.label}</b> — {cards}.</>}
    </span>
  );
}

const CONFETTI = ["#12965a", "#8ff0bd", "#3f63d6", "#6a45c0", "#f2b73d"];

/** The moment a session closes. The durable detail — what comes back when, and
 *  what you were weakest on — lives in the details pane, so it isn't repeated here. */
export function Results({ cards, onAgain }: { cards: SessionCard[]; onAgain: () => void }) {
  const total = cards.length;
  const correct = cards.filter((c) => c.answer?.correct).length;
  const pct = Math.round((correct / total) * 100);
  const perfect = correct === total;
  const line = pct >= 80 ? "Sharp. You know this cold." : pct >= 50 ? "Solid — a couple to revisit." : "Good start. Run it again.";
  return (
    <div className="results">
      {perfect && (
        <div className="confetti">
          {Array.from({ length: 16 }, (_, i) => (
            <i key={i} style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 6) * 0.07}s`, transform: `rotate(${i * 40}deg)` }} />
          ))}
        </div>
      )}
      <div className="results-top">
        <Ring value={correct} total={total} size={104} gradient>
          <div className="val">{pct}%</div>
        </Ring>
        <div className="results-head">
          <h3>Session complete</h3>
          <div className="sub">{correct} of {total} correct · {line}</div>
        </div>
      </div>
      <button className="start again" onClick={onAgain}>Study more<Arrow size={16} /></button>
    </div>
  );
}
