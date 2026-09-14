"use client";

import { useEffect, useState } from "react";

import { AGENT, Avatar } from "@/components/reference/agents";

/**
 * Job tabs that turn over on their own, x.ai/bot's "give each Bot a job" row, with a bar under the
 * active tab filling for as long as it stays up (Sana's carousel shows its time the same way). The
 * pointer pauses it; a click picks a tab.
 */
type Tab = { label: string; agent: keyof typeof AGENT; lines: { me?: boolean; text: string }[] };

export function AutoTabs({ tabs, interval = 4200 }: { tabs: Tab[]; interval?: number }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = window.setInterval(() => setI((n) => (n + 1) % tabs.length), interval);
    return () => window.clearInterval(t);
  }, [paused, tabs.length, interval, i]);
  const tab = tabs[i];
  const agent = AGENT[tab.agent];
  return (
    <div className="vh-tabs" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="vh-tab-row" role="tablist">
        {tabs.map((t, k) => (
          <button key={t.label} type="button" role="tab" aria-selected={k === i} className={k === i ? "vh-tab vh-on" : "vh-tab"} onClick={() => setI(k)}>
            <Avatar agent={AGENT[t.agent]} size={18} />
            {t.label}
            {k === i ? (
              <span key={i} className="vh-tab-bar" style={{ animationDuration: `${interval}ms`, animationPlayState: paused ? "paused" : "running" }} />
            ) : null}
          </button>
        ))}
      </div>
      <div className="vh-chat" key={i} role="tabpanel">
        <div className="vh-chat-head">
          <Avatar agent={agent} size={22} />
          <b>{agent.name}</b>
          <span>{tab.label}</span>
        </div>
        {tab.lines.map((l, k) => (
          <p key={k} className={l.me ? "vh-msg vh-me" : "vh-msg"} style={{ animationDelay: `${120 + k * 380}ms` }}>
            {l.text}
          </p>
        ))}
      </div>
    </div>
  );
}
