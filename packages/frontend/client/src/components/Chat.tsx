import type { ReactNode } from "react";
import { Avatar } from "./Teams";

/** Chat chrome: the shapes a message takes in the transcript. */
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
