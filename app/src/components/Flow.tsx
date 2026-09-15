import { useState, type CSSProperties, type ReactNode } from "react";
import type { Card, Choice, ReviewResult, TopicGroup } from "../lib/deck";
import { EXCERPTS, TOPIC_META, type TopicIcon } from "../data";
import { Arrow, Check, ChevronDown, Database, File, FileText, Repeat, Terminal, X } from "../icons";
import { Avatar } from "./Teams";
import { Mark } from "./Mark";

const GLYPH: Record<TopicIcon, (p: { size?: number }) => JSX.Element> = { terminal: Terminal, database: Database, repeat: Repeat, file: FileText };

/** Review grades submitted to the scheduler (SubmitReviewRequest.result) and the
 *  interval each produces: `incorrect` is auto on a miss; `hard`/`easy` on a hit. */
const GRADES: { key: ReviewResult; days: number }[] = [
  { key: "incorrect", days: 0 },
  { key: "hard", days: 1 },
  { key: "easy", days: 4 },
];
const gradeInfo = (g: ReviewResult) => GRADES.find((x) => x.key === g)!;
const when = (d: number) => (d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`);

export function BotMessage({ children, time = "now" }: { children: ReactNode; time?: string }) {
  return (
    <div className="msg">
      <span className="who"><Avatar size={32} bot /></span>
      <div className="body"><div className="head"><b>FlashLearn</b> · {time}</div>{children}</div>
    </div>
  );
}

export function UserMessage({ text }: { text: string }) {
  return <div className="user-msg"><span className="user-bubble">{text}</span></div>;
}

export function Typing() {
  return <div className="msg"><span className="who"><Avatar size={32} bot /></span><div className="body"><span className="typing"><i /><i /><i /></span></div></div>;
}

export function Welcome({ onStart, cards, topics }: { onStart: () => void; cards: number; topics: number }) {
  return (
    <div className="welcome">
      <div className="inner">
        <div className="mk"><Mark size={40} radius="14px 5px 14px 5px" /></div>
        <h2>Study your codebase,<br />right here in Teams.</h2>
        <p>FlashLearn turned your repo into {cards} cards across {topics} topics — each one cites the exact file and commit it came from.</p>
        <button className="cta" onClick={onStart}>Get started<Arrow size={16} /></button>
        <div className="meta"><span><b>{cards}</b> cards</span><span><b>{topics}</b> topics</span><span><b>~3</b> min</span></div>
      </div>
    </div>
  );
}

export function TopicChooser({ groups, total, onStart }: { groups: TopicGroup[]; total: number; onStart: (ids: string[], labels: string) => void }) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = sel.size === groups.length;
  const selectAll = () => setSel(allOn ? new Set() : new Set(groups.map((g) => g.id)));
  const count = groups.filter((g) => sel.has(g.id)).reduce((n, g) => n + g.total, 0);
  const start = () => onStart([...sel], groups.filter((g) => sel.has(g.id)).map((g) => g.label).join(", "));

  return (
    <div className="pick">
      <div className="pick-head">
        <div><span className="t">Choose topics</span><span className="psub">{groups.length} topics · {total} cards · ~{Math.max(1, Math.round(total * 0.5))} min</span></div>
        <button className="selall" onClick={selectAll}>{allOn ? "Clear" : "Select all"}</button>
      </div>
      <div className="pick-body">
        <div className="topics">
          {groups.map((g) => {
            const meta = TOPIC_META[g.id] ?? { accent: "#12965a", icon: "file" as TopicIcon, mastered: 0 };
            const Glyph = GLYPH[meta.icon];
            const on = sel.has(g.id);
            return (
              <button key={g.id} className={`topic${on ? " sel" : ""}`} style={{ "--a": meta.accent } as CSSProperties} onClick={() => toggle(g.id)}>
                <span className="tglyph"><Glyph size={17} /></span>
                <span className="tmain">
                  <span className="tlabel">{g.label}</span>
                  <span className="tmastery">
                    <span className="dots">{Array.from({ length: g.total }, (_, i) => <i key={i} className={i < meta.mastered ? "on" : ""} />)}</span>
                    <em>{meta.mastered}/{g.total} mastered</em>
                  </span>
                </span>
                <span className="tcheck">{on && <Check size={14} />}</span>
              </button>
            );
          })}
        </div>
        <button className="start" disabled={count === 0} onClick={start}>
          {count === 0 ? "Select a topic to begin" : `Start · ${count} question${count === 1 ? "" : "s"}`}<Arrow size={16} />
        </button>
      </div>
    </div>
  );
}

const LETTERS = ["A", "B", "C"];

export function FlashCard({ card, index, total, choices, chosen, grade, current, onChoose, onGrade }: {
  card: Card; index: number; total: number; choices: Choice[]; chosen: Choice | null; grade: ReviewResult | null; current: boolean;
  onChoose: (c: Choice) => void; onGrade: (g: ReviewResult) => void;
}) {
  const answered = chosen !== null;
  const topic = card.tags?.[0] ?? "";
  const answer = choices.find((c) => c.correct)?.text ?? "";
  const [open, setOpen] = useState(false);
  const ex = EXCERPTS[card.id];

  return (
    <div className="qcard">
      <div className="qtop">
        <span className="qbrand"><span className="m"><Mark size={16} radius="6px 2px 6px 2px" /></span> FlashLearn</span>
        <span className="qtag">{topic}</span>
      </div>
      <div className="qmeta">
        <span className="frac">{index + 1} / {total}</span>
        <span className="qseg">{Array.from({ length: total }, (_, i) => <i key={i} className={i < index ? "done" : i === index ? "cur" : ""} />)}</span>
      </div>
      <p className="qtext">{card.question}</p>
      <div className="qchoices">
        {choices.map((c, i) => {
          const cls = !answered ? "" : c.correct ? " correct" : c === chosen ? " wrong" : " dim";
          return (
            <button key={i} className={`qchoice${cls}`} disabled={answered} onClick={() => onChoose(c)}>
              <span className="k">{LETTERS[i]}</span><span className="qc-text">{c.text}</span>
              {answered && c.correct && <span className="qc-mark ok"><Check size={13} /></span>}
              {answered && !c.correct && c === chosen && <span className="qc-mark no"><X size={13} /></span>}
            </button>
          );
        })}
      </div>

      {answered && (
        <div className={`qfb ${chosen.correct ? "ok" : "no"}`}>
          {chosen.correct ? <><Check size={15} /> Correct!</> : <><X size={15} /> Not quite — it&rsquo;s {answer}</>}
        </div>
      )}

      {answered && !grade && current && (chosen.correct ? (
        <div className="grade">
          <div className="grade-q">How did that go?</div>
          <div className="grade-btns">
            <button className="g g-hard" onClick={() => onGrade("hard")}>Hard<em>{when(gradeInfo("hard").days)}</em></button>
            <button className="g g-easy" onClick={() => onGrade("easy")}>Easy<em>{when(gradeInfo("easy").days)}</em></button>
          </div>
        </div>
      ) : (
        <div className="grade">
          <div className="grade-q">You&rsquo;ll see this one again today.</div>
          <button className="g-primary" onClick={() => onGrade("incorrect")}>Continue<Arrow size={15} /></button>
        </div>
      ))}
      {grade && (
        <div className="graded">Scheduled · comes back {when(gradeInfo(grade).days)}</div>
      )}

      <button className={`qsrc${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)}>
        <File size={11} />{card.source.path} <span className="sha">@{card.source.sha.slice(0, 7)}</span>
        <ChevronDown size={13} className="chev" />
      </button>
      {open && ex && (
        <div className="qcode">
          <div className="qcode-h"><Check size={12} className="g" /> generated from this source · {ex.lines}</div>
          <pre>{ex.code}</pre>
        </div>
      )}
    </div>
  );
}

const CONFETTI = ["#12965a", "#8ff0bd", "#3f63d6", "#6a45c0", "#f2b73d"];

export function Results({ session, answers, grades, onAgain }: {
  session: Card[]; answers: (Choice | null)[]; grades: (ReviewResult | null)[]; onAgain: () => void;
}) {
  const total = session.length;
  const correct = answers.filter((a) => a?.correct).length;
  const pct = Math.round((correct / total) * 100);
  const perfect = correct === total;
  const line = pct >= 80 ? "Sharp. You know this cold." : pct >= 50 ? "Solid — a couple to revisit." : "Good start. Run it again.";
  const missed = session.filter((_, i) => answers[i] && !answers[i]!.correct);
  const days = grades.map((g) => (g ? gradeInfo(g).days : 1));
  const tomorrow = days.filter((d) => d <= 1).length;
  const thisWeek = days.filter((d) => d > 1 && d <= 7).length;
  const R = 46;
  const C = 2 * Math.PI * R;

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
        <div className="ring">
          <svg width="104" height="104" viewBox="0 0 104 104" style={{ position: "absolute", transform: "rotate(-90deg)" }}>
            <circle cx="52" cy="52" r={R} fill="none" stroke="#e7ece7" strokeWidth="7" />
            <circle cx="52" cy="52" r={R} fill="none" stroke="url(#rg)" strokeWidth="7" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} />
            <defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#12965a" /><stop offset="1" stopColor="#6a45c0" /></linearGradient></defs>
          </svg>
          <div><div className="val">{pct}%</div></div>
        </div>
        <div className="results-head">
          <h3>Session complete</h3>
          <div className="sub">{correct} of {total} correct · {line}</div>
        </div>
      </div>

      <div className="rsec">
        <h4>Coming back</h4>
        <div className="schedule">
          <span className="sch tm"><b>{tomorrow}</b> tomorrow</span>
          <span className="sch wk"><b>{thisWeek}</b> this week</span>
          <span className="note">scheduled by how you graded each card</span>
        </div>
      </div>

      {missed.length > 0 && (
        <div className="rsec">
          <h4>Review these</h4>
          <div className="missed">
            {missed.slice(0, 4).map((c) => (
              <div className="miss" key={c.id}>
                <span className="mx"><X size={11} /></span>
                <span className="mq">{c.question}</span>
                <span className="msrc">{c.source.path.split("/").pop()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <button className="start again" onClick={onAgain}>Study more<Arrow size={16} /></button>
    </div>
  );
}
