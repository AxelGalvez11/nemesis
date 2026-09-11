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
    // Armed on the next frame rather than inside the effect body: a synchronous setState here renders
    // twice on mount (react-hooks/set-state-in-effect), and the element is not hidden either way.
    const raf = requestAnimationFrame(() => {
      setArmed(true);
      if (typeof IntersectionObserver === "undefined") setInView(true);
    });
    if (typeof IntersectionObserver === "undefined") return () => cancelAnimationFrame(raf);
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
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
    };
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
// 🔴 DENSITY IS WHAT MADE x.ai'S WINDOW READ AS A PRODUCT (owner, 2026-09-10: "the mockups need to
// look better like in x.ai"). The first version had the right anatomy and almost nothing in it: two
// bubbles and a list. Theirs carries an attachment, timestamps under names, services named in bold with
// counts, mention chips and a live working line. So does this one, with our content.
const AGENTS = [
  { key: "claude", name: "Claude", tone: "violet", time: "9:41", preview: "Deck ready: 42 cards, scheduled", on: true },
  { key: "nemesis", name: "Nemesis", tone: null, time: "9:42", preview: "3 cards went back for a source" },
  { key: "chatgpt", name: "ChatGPT", tone: "azure", time: "Yesterday", preview: "Slides for the French Revolution", unread: true },
  { key: "cursor", name: "Cursor", tone: "emerald", time: "Yesterday", preview: "Turned lab code into a study guide" },
  { key: "tutor", name: "Contract Law", tone: "orange", time: "Mon", preview: "Offer and acceptance, 6 sections" },
] as const;

const PEEK = ["What does the second law say about entropy?", "Why can no heat engine be 100% efficient?", "What is a thermal reservoir?"];

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
        <p className="mk-side-label">Agents</p>
        {AGENTS.map((a, i) => (
          <In i={i} key={a.key}>
            <div className={`mk-row${"on" in a && a.on ? " is-on" : ""}`}>
              {a.tone ? <Avatar label={a.name.slice(0, 1)} tone={a.tone} /> : <NemesisAvatar />}
              <div className="mk-row-body">
                <div className="mk-row-top">
                  <span className="mk-row-name">{a.name}</span>
                  <span className="mk-row-time">{a.time}</span>
                </div>
                <span className="mk-row-preview">
                  {"unread" in a && a.unread ? <i className="mk-unread" aria-hidden="true" /> : null}
                  {a.preview}
                </span>
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
          <span className="mk-chat-title">Thermodynamics</span>
          <span className="mk-chat-sub">Lecture 6</span>
          <span className="mk-people" aria-hidden="true">
            <span className="mk-avatar mk-avatar-you" style={{ width: 22, height: 22, fontSize: 9 }}>
              Y
            </span>
            <Avatar label="C" tone="violet" size={22} />
            <NemesisAvatar size={22} />
          </span>
          <span className="mk-tag">
            <i className="mk-live" aria-hidden="true" />
            Connected
          </span>
        </header>

        <div className="mk-thread">
          <In i={1} className="mk-divider">
            You added Claude to this course · 9:38
          </In>
          <In i={2} className="mk-me">
            <span className="mk-file">
              <span className="mk-file-page" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
              </span>
              <span>
                <b>Lecture 6.pdf</b>
                <em>38 slides</em>
              </span>
            </span>
            <span className="mk-bubble mk-bubble-me">Turn this into something I can study before Friday&apos;s exam.</span>
          </In>
          <In i={3} className="mk-msg">
            <span className="mk-msg-head">
              <Avatar label="C" tone="violet" size={20} />
              <b>Claude</b>
              <time>9:41</time>
            </span>
            <div className="mk-bubble">
              <ul className="mk-tools">
                <li>
                  <Check />
                  <b>Reader</b>
                  <span>Lecture 6.pdf, 38 slides read</span>
                </li>
                <li>
                  <Check />
                  <b>Deck builder</b>
                  <span>42 cards, scheduled with FSRS</span>
                </li>
                <li>
                  <Check />
                  <b>Slides</b>
                  <span>12-slide summary, .pptx</span>
                </li>
                <li className="mk-working">
                  <span className="mk-spinner" aria-hidden="true" />
                  <b>Study guide</b>
                  <span>writing section 4 of 6</span>
                </li>
              </ul>
              <div className="mk-peek">
                {PEEK.map((q) => (
                  <span key={q} className="mk-peek-card">
                    {q}
                  </span>
                ))}
                <span className="mk-peek-more">+39</span>
              </div>
            </div>
          </In>
          <In i={4} className="mk-msg">
            <span className="mk-msg-head">
              <NemesisAvatar size={20} />
              <b>Nemesis</b>
              <time>9:42</time>
            </span>
            <div className="mk-bubble">
              Checked all 42. <span className="mk-mention">3 cards</span> had no source, so they went back to{" "}
              <span className="mk-mention mk-mention-violet">Claude</span>. Your first review is tomorrow at 9:00.
            </div>
          </In>
          <In i={5} className="mk-typing">
            <span className="mk-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            Claude is fixing 3 cards
          </In>
        </div>

        <div className="mk-composer">
          <span className="mk-attach" aria-hidden="true">+</span>
          <span className="mk-composer-text">Message Claude or @Nemesis</span>
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
