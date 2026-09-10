"use client";

import { useEffect, useRef, useState } from "react";

import { NemesisMark } from "@/components/NemesisMark";

import "./mockups.css";

/**
 * Coded product mockups for the landing page variations.
 *
 * Owner, 2026-09-10: "I would like to see mockups like in the x.ai/bot."
 *
 * 🔴 CODED, NOT SCREENSHOTS, BECAUSE THAT IS WHAT x.ai DOES. Measured 2026-09-10: their hero window
 * is a live component, 976x660 at radius 24, holding 803 elements — a 280px sidebar, a 254x32
 * search field at radius 10, agent rows 254x53 at radius 10 on a 55px pitch with 32px round
 * avatars, agent bubbles at radius 16 on ink at 4%, the user's own bubble near-black, and a 46px
 * pill composer with a 28px send button. Rows enter over 0.28s on cubic-bezier(0.2, 0.9, 0.3, 1.15),
 * a small overshoot. Every number below is one of those. The words, the content and the product
 * shown are ours.
 *
 * WHAT IS SHOWN IS REAL, WITH ONE EXCEPTION. FSRS scheduling, slide decks (.pptx) and documents
 * (.docx) are all built in the app today. Outside agents connecting (Claude, ChatGPT, Cursor) is
 * NOT built yet; the owner chose to show them by name, without their logos, knowing it reads as a
 * promise for launch.
 *
 * 🔴 NO LOGOS FOR OTHER COMPANIES. Agent avatars are initials on our own palette, and the colours
 * are deliberately NOT each company's brand colour, so nothing here imitates their marks.
 *
 * 🔴 FIELD-AGNOSTIC CONTENT. Thermodynamics, contract law and history, never one discipline, and
 * never the drug examples that crept into earlier drafts. Nemesis is for anyone learning anything.
 */

/* ── motion: armed only after mount, so a page with no JavaScript renders fully visible ────── */
// 🔴 THE STATE CLASS IS `mk-is-in`, NOT `is-in`. The old homepage's globals.css already defines `.is-in`
// for its own scroll reveals, and the preview shares that stylesheet. lib/reference/no-class-collisions
// caught the overlap on its first run, the same class of fault that broke the brand page's layout.
function useInView<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [armed, setArmed] = useState(false);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setArmed(true);
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, armed, inView };
}

function Reveal({
  as: Tag = "div",
  className,
  children,
}: {
  as?: "div" | "section";
  className?: string;
  children: React.ReactNode;
}) {
  const { ref, armed, inView } = useInView<HTMLDivElement>();
  return (
    <Tag
      ref={ref as React.Ref<HTMLDivElement>}
      className={["mk", className, inView ? "mk-is-in" : ""].filter(Boolean).join(" ")}
      data-armed={armed ? "true" : undefined}
    >
      {children}
    </Tag>
  );
}

/** A child that joins the staggered entrance. `i` sets its place in the queue (60ms steps). */
function In({ i, className, children }: { i: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={["mk-in", className].filter(Boolean).join(" ")} style={{ ["--i" as string]: i }}>
      {children}
    </div>
  );
}

/* ── shared pieces ─────────────────────────────────────────────────────────────────────── */
const TONE = {
  violet: "#8A63F0",
  azure: "#2A8CCD",
  emerald: "#17B87A",
  orange: "#FF7A1A",
  coral: "#FF5C7A",
  lime: "#A8D91F",
} as const;

function Avatar({ label, tone, size = 32 }: { label: string; tone: keyof typeof TONE; size?: number }) {
  return (
    <span className="mk-avatar" style={{ background: TONE[tone], width: size, height: size, fontSize: size * 0.4 }}>
      {label}
    </span>
  );
}

function NemesisAvatar({ size = 32 }: { size?: number }) {
  return (
    <span className="mk-avatar mk-avatar-nemesis" style={{ width: size, height: size }}>
      <NemesisMark state="static" size={Math.round(size * 0.5)} />
    </span>
  );
}

function Check() {
  return (
    <svg className="mk-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The frame that holds a mockup on one of the approved gradient images. */
export function ArtGround({
  name,
  className,
  children,
}: {
  name: "orange" | "lime" | "emerald" | "azure" | "coral" | "violet";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={["mk-ground", className].filter(Boolean).join(" ")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="mk-ground-img" src={`/gradients/${name}.webp`} alt="" decoding="async" />
      <div className="mk-ground-body">{children}</div>
    </div>
  );
}

/* ── 1. The workspace: an outside agent working inside Nemesis ─────────────────────────── */
const AGENTS = [
  { key: "claude", name: "Claude", tone: "violet", time: "9:41", preview: "Deck ready: 42 cards, scheduled", on: true },
  { key: "nemesis", name: "Nemesis", tone: null, time: "9:30", preview: "Your review is ready for tomorrow" },
  { key: "chatgpt", name: "ChatGPT", tone: "azure", time: "Yesterday", preview: "Slides for the French Revolution" },
  { key: "cursor", name: "Cursor", tone: "emerald", time: "Yesterday", preview: "Turned lab code into a study guide" },
  { key: "tutor", name: "Contract Law", tone: "orange", time: "Mon", preview: "Offer and acceptance, 6 sections" },
] as const;

export function WorkspaceMock() {
  return (
    <Reveal className="mk-window">
      <span className="mk-lights" aria-hidden="true">
        <i style={{ background: "#FF5F57" }} />
        <i style={{ background: "#FEBC2E" }} />
        <i style={{ background: "#28C840" }} />
      </span>

      <aside className="mk-sidebar">
        <div className="mk-sidebar-head">
          <span className="mk-plus" aria-hidden="true">+</span>
        </div>
        <label className="mk-search">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>Search</span>
        </label>
        {AGENTS.map((a, i) => (
          <In i={i} key={a.key}>
            <div className={`mk-row${"on" in a && a.on ? " is-on" : ""}`}>
              {a.tone ? <Avatar label={a.name.slice(0, 1)} tone={a.tone} /> : <NemesisAvatar />}
              <div className="mk-row-body">
                <div className="mk-row-top">
                  <span className="mk-row-name">{a.name}</span>
                  <span className="mk-row-time">{a.time}</span>
                </div>
                <span className="mk-row-preview">{a.preview}</span>
              </div>
            </div>
          </In>
        ))}
        <div className="mk-sidebar-foot">
          <span className="mk-foot-avatar">YW</span>
          <span className="mk-foot-name">Your workspace</span>
        </div>
      </aside>

      <section className="mk-chat">
        <header className="mk-chat-head">
          <Avatar label="C" tone="violet" size={20} />
          <span className="mk-chat-title">Claude</span>
          <span className="mk-tag">Connected to Nemesis</span>
        </header>

        <div className="mk-thread">
          <In i={1} className="mk-divider">Claude is using your Nemesis tools</In>
          <In i={2} className="mk-bubble mk-bubble-me">
            Turn Lecture 6 into something I can actually study before Friday&apos;s exam.
          </In>
          <In i={3} className="mk-bubble">
            <ul className="mk-tools">
              <li><Check /><b>Reader</b> → Thermodynamics, Lecture 6 · 38 slides read</li>
              <li><Check /><b>Deck builder</b> → 42 cards · scheduled with FSRS</li>
              <li><Check /><b>Slides</b> → 12-slide summary · .pptx</li>
              <li><Check /><b>Study guide</b> → 6 sections, every claim cited</li>
            </ul>
          </In>
          <In i={4} className="mk-bubble">
            All four are in your workspace. Your first review is tomorrow at 9:00, and the cards on
            entropy come back sooner because they are the ones you missed last week.
          </In>
          <In i={5} className="mk-pending">
            <span className="mk-spinner" aria-hidden="true" />
            Checking every card against the deck rules
          </In>
        </div>

        <div className="mk-composer">
          <span className="mk-attach" aria-hidden="true">+</span>
          <span className="mk-composer-text">Message Claude</span>
          <span className="mk-send" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="14" height="14">
              <path d="M8 13V3.5M3.5 7.5 8 3l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      </section>
    </Reveal>
  );
}

/* ── 2. The FSRS deck. Flashcards are white: the owner has ruled that three times. ────────── */
export function DeckMock() {
  return (
    <Reveal className="mk-panel mk-deck">
      <In i={0} className="mk-panel-head">
        <span className="mk-panel-title">Thermodynamics</span>
        <span className="mk-chip">12 due</span>
        <span className="mk-chip">FSRS</span>
      </In>
      <In i={1} className="mk-flash">
        <p className="mk-flash-q">What does the second law say about the entropy of an isolated system?</p>
        <p className="mk-flash-a">It never decreases. It stays constant only for a reversible process.</p>
        <span className="mk-flash-src">From Lecture 6, slide 14</span>
      </In>
      <In i={2} className="mk-grades">
        {[
          ["Again", "1m"],
          ["Hard", "8m"],
          ["Good", "2d"],
          ["Easy", "6d"],
        ].map(([g, t]) => (
          <span key={g} className={`mk-grade${g === "Good" ? " is-on" : ""}`}>
            {g}
            <i>{t}</i>
          </span>
        ))}
      </In>
      <In i={3} className="mk-meta">Next review scheduled for 90% recall</In>
    </Reveal>
  );
}

/* ── 3. Slides ──────────────────────────────────────────────────────────────────────────── */
export function SlidesMock() {
  return (
    <Reveal className="mk-panel mk-slides">
      <In i={0} className="mk-panel-head">
        <span className="mk-panel-title">The French Revolution</span>
        <span className="mk-chip">12 slides</span>
        <span className="mk-chip">.pptx</span>
      </In>
      <In i={1} className="mk-slide">
        <span className="mk-slide-kicker">Causes, 1787 to 1789</span>
        <span className="mk-slide-title">A state that could not pay its debts</span>
        <ul className="mk-slide-list">
          <li>War debt and a tax system that exempted the nobility</li>
          <li>Two failed harvests and the price of bread</li>
          <li>The Estates-General called for the first time since 1614</li>
        </ul>
      </In>
      <In i={2} className="mk-thumbs">
        {[0, 1, 2, 3, 4].map((n) => (
          <span key={n} className={`mk-thumb${n === 1 ? " is-on" : ""}`}>
            <i />
            <i />
          </span>
        ))}
      </In>
    </Reveal>
  );
}

/* ── 4. A study guide document ─────────────────────────────────────────────────────────── */
export function DocMock() {
  return (
    <Reveal className="mk-panel mk-doc">
      <In i={0} className="mk-panel-head">
        <span className="mk-panel-title">Offer and Acceptance</span>
        <span className="mk-chip">Contract law</span>
        <span className="mk-chip">.docx</span>
      </In>
      <In i={1} className="mk-callout">
        <b>Offer.</b> A clear promise to be bound on specific terms, made so that it can be accepted.
      </In>
      <In i={2}>
        <ol className="mk-steps">
          <li>An advertisement is usually an invitation to treat, not an offer.</li>
          <li>Acceptance has to mirror the terms of the offer exactly.</li>
          <li>Silence does not count as acceptance.</li>
        </ol>
      </In>
      <In i={3} className="mk-table">
        <span className="mk-th">Case</span>
        <span className="mk-th">Principle</span>
        <span>Carlill v Carbolic Smoke Ball (1893)</span>
        <span>A unilateral offer can be accepted by conduct</span>
        <span>Hyde v Wrench (1840)</span>
        <span>A counter-offer ends the original offer</span>
      </In>
    </Reveal>
  );
}

/* ── 5. Structured, not slop: the rules every output has to pass ──────────────────────── */
export function SchemaMock() {
  return (
    <Reveal className="mk-schema">
      <In i={0} className="mk-panel mk-rules">
        <span className="mk-panel-title">Deck rules</span>
        <ul className="mk-fields">
          <li><code>front</code><span>text · required</span></li>
          <li><code>back</code><span>text · required</span></li>
          <li><code>source</code><span>slide or page · required</span></li>
          <li><code>tags</code><span>list</span></li>
          <li><code>scope</code><span>one idea per card</span></li>
        </ul>
      </In>
      <div className="mk-verdicts">
        <In i={1} className="mk-verdict is-pass">
          <span className="mk-verdict-state"><Check /> Accepted</span>
          <p>What does entropy measure?</p>
          <span className="mk-verdict-meta">source: Lecture 6, slide 9 · 5 of 5 rules passed</span>
        </In>
        <In i={2} className="mk-verdict is-fail">
          <span className="mk-verdict-state">✕ Sent back</span>
          <p>Explain the whole of thermodynamics</p>
          <span className="mk-verdict-meta">no source · more than one idea · returned to Claude to fix</span>
        </In>
      </div>
    </Reveal>
  );
}

/* ── 6. Nemesis's own AI, on the canvas ─────────────────────────────────────────────────── */
export function CanvasMock() {
  return (
    <Reveal className="mk-canvas">
      <svg className="mk-canvas-dots" aria-hidden="true">
        <defs>
          <pattern id="mk-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="1.1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mk-dots)" />
      </svg>
      <In i={0} className="mk-card mk-card-q">
        <NemesisAvatar size={24} />
        Why does a heat engine need a cold reservoir?
      </In>
      <In i={1} className="mk-card mk-card-answer">
        Because work only comes out of heat that flows <b>somewhere</b>. Without a colder place to
        dump heat, nothing flows, and the engine does no work. That is the second law setting a
        ceiling on efficiency.
      </In>
      <In i={2} className="mk-card mk-card-src">
        <span className="mk-src-kicker">Source</span>
        Lecture 6, slide 22 · Carnot efficiency
      </In>
      <In i={3} className="mk-card mk-card-next">
        <span className="mk-chip">Make 6 cards from this</span>
      </In>
    </Reveal>
  );
}
