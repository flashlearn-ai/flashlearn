import type { ReactNode } from "react";
import { AddPeople, Bell, Calendar, Chat, More, People, Pencil, Phone, Search, Send, Video } from "../icons";
import { Mark } from "./Mark";

export function Avatar({ size = 34, bg, initials, presence, bot }: { size?: number; bg?: string; initials?: string; presence?: "avail" | "busy" | "away"; bot?: boolean }) {
  return (
    <span className={`avatar${bot ? " bot" : ""}`} style={{ width: size, height: size, background: bot ? undefined : bg, fontSize: size * 0.36 }}>
      {bot ? <Mark size={size} radius="50%" /> : initials}
      {presence && <span className="dot" style={{ background: `var(--${presence})` }} />}
    </span>
  );
}

export function Rail() {
  return (
    <nav className="rail" aria-hidden>
      <span className="rail-item"><Bell /> Activity</span>
      <span className="rail-item on"><Chat /> Chat</span>
      <span className="rail-item"><People /> Teams</span>
      <span className="rail-item"><Calendar /> Calendar</span>
      <span className="rail-item"><Phone /> Calls</span>
      <span className="rail-me"><Avatar size={30} bg="#4b53bc" initials="SW" presence="avail" /></span>
    </nav>
  );
}

/** Invented chrome for the Teams shell: these are not real messages and nothing
 *  reads them. Preview lines must not state results, versions or benchmarks that
 *  a reader could mistake for something FlashLearn actually produced. */
const CONTACTS: { name: string; time: string; prev: string; bg: string; initials: string; presence: "avail" | "busy" | "away"; you?: boolean; unread?: boolean }[] = [
  { name: "David Gamero", time: "3:35 PM", prev: "can you take the frontend endpoints today?", bg: "#5b7fb0", initials: "DG", presence: "busy", unread: true },
  { name: "Manasa Chinta", time: "3:30 PM", prev: "pushed the doc-comment extractor, give it a spin", bg: "#a3855d", initials: "MC", presence: "away" },
  { name: "Sagar Poojary", time: "3:26 PM", prev: "perfect, atomic writes are exactly it", bg: "#4f8a7b", initials: "SP", presence: "avail", you: true },
  { name: "Jenny Liu", time: "3:21 PM", prev: "brb gotta find my charger", bg: "#b07fb0", initials: "JL", presence: "avail" },
];

export function ChatList() {
  return (
    <aside className="list">
      <div className="list-top"><h1>Chat</h1><span className="tools"><Pencil size={18} /><More size={18} /></span></div>
      <div className="search"><Search size={15} /> Search</div>
      <div className="tabs"><span className="on">Recent</span><span>Favorites</span></div>
      <div className="chat on">
        <Avatar bot />
        <span className="meta"><span className="row1"><span className="name">FlashLearn</span><span className="time">now</span></span><span className="prev">Ready when you are</span></span>
      </div>
      {CONTACTS.map((c) => (
        <div className={`chat${c.unread ? " unread" : ""}`} key={c.name}>
          <Avatar bg={c.bg} initials={c.initials} presence={c.presence} />
          <span className="meta">
            <span className="row1"><span className="name">{c.name}</span><span className="time">{c.time}</span></span>
            <span className="prev">{c.you && <span className="you">You: </span>}{c.prev}</span>
          </span>
          {c.unread && <span className="pip" />}
        </div>
      ))}
    </aside>
  );
}

export function Conversation({ children }: { children: ReactNode }) {
  return (
    <main className="conv">
      <header className="conv-head">
        <Avatar size={38} bot presence="avail" />
        <span className="who">
          <span className="title-row"><span className="title">FlashLearn</span><span className="badge">APP</span></span>
          <span className="sub"><span className="p" />Available · turns code and docs into a quiz</span>
        </span>
        <span className="actions"><Video size={19} /><Phone size={19} /><AddPeople size={19} /><More size={19} /></span>
      </header>
      <div className="conv-tabs"><span className="on">Chat</span><span>Shared</span><span>Activity</span></div>
      {children}
      <div className="composer">
        <div className="field">Type a message</div>
        <div className="bar"><span className="aa">Aa</span><span className="gif">GIF</span><span className="send"><Send /></span></div>
      </div>
    </main>
  );
}
