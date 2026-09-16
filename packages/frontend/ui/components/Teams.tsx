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

const CONTACTS: { name: string; time: string; prev: string; bg: string; initials: string; presence: "avail" | "busy" | "away" }[] = [
  { name: "Engineering", time: "", prev: "Explore your codebase", bg: "#5b7fb0", initials: "EN", presence: "avail" },
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
        <div className="chat" key={c.name}>
          <Avatar bg={c.bg} initials={c.initials} presence={c.presence} />
          <span className="meta"><span className="row1"><span className="name">{c.name}</span><span className="time">{c.time}</span></span><span className="prev">{c.prev}</span></span>
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
          <span className="sub"><span className="p" />Available · turns your repo into a quiz</span>
        </span>
        <span className="actions"><Video size={19} /><Phone size={19} /><AddPeople size={19} /><More size={19} /></span>
      </header>
      <div className="conv-tabs"><span className="on">Chat</span><span>Shared</span><span>Activity</span></div>
      {children}
      <div className="composer">
        <div className="field">Use the study controls above</div>
        <div className="bar"><span className="aa">Aa</span><span className="gif">GIF</span><span className="send"><Send /></span></div>
      </div>
    </main>
  );
}
