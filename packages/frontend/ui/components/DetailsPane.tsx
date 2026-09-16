import { Mark } from "./Mark";

/** Teams-style "About this app" pane — fills the wide space and adds fidelity. */
export function DetailsPane({ cards, topics, sources, demo }: { cards: number; topics: number; sources: number; demo: boolean }) {
  return (
    <aside className="details">
      <div className="hero">
        <div className="mk"><Mark size={40} radius="14px 5px 14px 5px" /></div>
        <h3>FlashLearn</h3>
        <div className="by">Learning assistant · by the Coolest Team</div>
        <span className="pill"><span className="p" /> Available</span>
      </div>
      <div className="dsec">
        <h4>About</h4>
        <p>{demo ? "Public demo using hand-authored examples from an imaginary repository. No local repository is accessed." : "Review cards from your selected local project. Each card displays its recorded source path and commit."}</p>
      </div>
      <div className="dsec">
        <h4>How it works</h4>
        <div className="steps">
          <div className="step"><span className="n">1</span><span>Point it at a repo — it extracts questions from the code and docs.</span></div>
          <div className="step"><span className="n">2</span><span>Think about the question, then reveal the answer.</span></div>
          <div className="step"><span className="n">3</span><span>{demo ? "Try each rating. Demo progress lasts only for this session." : "Rate your recall; the learning engine saves your next review date."}</span></div>
        </div>
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
