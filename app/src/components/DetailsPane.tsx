import { Mark } from "./Mark";

/** Teams-style "About this app" pane — fills the wide space and adds fidelity. */
export function DetailsPane({ cards, topics }: { cards: number; topics: number }) {
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
        <p>Turns any Git repository into attributed flashcards, then quizzes you right here in chat. Every card cites the file and commit it came from.</p>
      </div>
      <div className="dsec">
        <h4>How it works</h4>
        <div className="steps">
          <div className="step"><span className="n">1</span><span>Point it at a repo — it extracts questions from the code and docs.</span></div>
          <div className="step"><span className="n">2</span><span>Pick topics and answer, one card at a time.</span></div>
          <div className="step"><span className="n">3</span><span>It schedules reviews so the ones you miss come back.</span></div>
        </div>
      </div>
      <div className="dsec">
        <h4>This deck</h4>
        <div className="dstats">
          <div className="dstat"><b>{cards}</b><span>Cards</span></div>
          <div className="dstat"><b>{topics}</b><span>Topics</span></div>
          <div className="dstat"><b>4</b><span>Sources</span></div>
        </div>
      </div>
    </aside>
  );
}
