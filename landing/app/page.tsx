import type { CSSProperties } from "react";

import { Mascot } from "@/components/home/Mascot";
import { DeviceShot, LoopVideo } from "@/components/reference/device/DeviceShot";
import { DEVICE_PHOTOS } from "@/components/reference/device/photos";
import { CharacterMark } from "@/components/reference/agents";
import { Marquee } from "@/components/reference/Marquee";
import { Deliverables } from "@/components/reference/StudyTools";
import { DeckMock, WorkspaceMock } from "@/components/reference/mockups/Mockups";
import { Reveal, Slots, TypeOn, Words } from "@/components/reference/motion/Motion";
import { SnFaq, SnFoot, SnHeader } from "@/components/reference/SanaChrome";

import "./home-sana.css";

/**
 * The homepage.
 *
 * 🔴🔴 THIS REPLACES THE HERO/LEARNANYTHING/FEATURES/CLOSER PAGE, AND THOSE FILES ARE LEFT ON DISK,
 * UNIMPORTED. Owner, 2026-09-10, after seeing four round-two variations built on sanalabs.com's
 * measured anatomy: "I like the way the together one looks. It looks really nice", then, the next
 * message, "put it on the site now". Same convention this file's own history already used for `Look`
 * and `CanvasShowcase` (see git blame before this commit): the old page is good work, nothing else
 * imports it, and it costs nothing to keep in case a future direction wants it back.
 *
 * WHAT IS REAL. FSRS scheduling, .pptx slides, .docx guides, seventeen input formats, lecture recording and the
 * canvas all exist in the app today. Outside agents connecting (Claude, ChatGPT, Cursor) is not built; the owner chose
 * on 2026-09-10 to show it by name, as a promise for launch. Of the seven deliverables, flashcards, quizzes, study guides
 * and slides are built; mind maps, cheat sheets and practice exams are not, and the owner chose to show them anyway.
 *
 * OWNER, 2026-09-11: "remove that thermodynamic chart section, just show the deliverables"; the photo section (FSRS,
 * ideas stay connected, slides and guides) "do not fit"; "Remove video summary and study packet and podcast and course
 * map"; "Make lecture notes its own section with a cool animation", "similar to launch video style". The lecture clip is
 * a HyperFrames render (~/Desktop/nemesis-reel/showcase-lecture.html) in the same kit as the other two.
 *
 * 🔴 NO INVENTED TESTIMONIALS. Sana's own page runs quotes from named customers; Nemesis has none to
 * quote, and a made-up quote with a made-up name is a fake review, so the sections that carry quotes
 * there carry product here instead.
 *
 * 🔴 THE SCHOOL BANNER IS THE ONE NAMED-INSTITUTION CLAIM ON THE PAGE, AND IT IS SCOPED ON PURPOSE.
 * Owner, 2026-09-10, confirming real usage: "just say used by real students at these top Ivy League
 * universities... It's true." The banner says stu­dents AT these schools use Nemesis — an individual
 * fact — never that the schools themselves partner with, endorse or officially provide Nemesis, which
 * would be a different and false claim. "Ivy League" is not used as a label: the list mixes Ivy League
 * with other top schools (MIT, Oxford, Caltech, ETH Zürich...), and calling a mixed list "Ivy League"
 * would itself be inaccurate. Names only, no crests: see Marquee.tsx.
 */
const TONE = { violet: "#8A63F0", azure: "#2A8CCD", emerald: "#17B87A", ink: "#0d0f10" } as const;

const WORKS = [
  "Claude",
  "Lecture slides",
  "ChatGPT",
  "PDF readings",
  "Cursor",
  "Handwritten notes",
  "Nemesis AI",
  "Recorded lectures",
  "Word documents",
  "Your own notes",
];

// Names only, in one serif: see Marquee.tsx for why there are no crests and no institutional claim.
const SCHOOLS = [
  "Harvard University",
  "Stanford University",
  "MIT",
  "University of Oxford",
  "University of Cambridge",
  "Yale University",
  "Princeton University",
  "UC Berkeley",
  "Columbia University",
  "Imperial College London",
  "ETH Zürich",
  "University of Toronto",
  "Caltech",
  "University of Chicago",
  "Johns Hopkins University",
  "National University of Singapore",
];

type Who = { label: string; tone: string; character?: boolean };
const CLAUDE: Who = { label: "C", tone: TONE.violet };
const GPT: Who = { label: "G", tone: TONE.azure };
const YOU: Who = { label: "Y", tone: TONE.ink };
// Nemesis is the character itself, never a letter in a circle (owner, 2026-09-10: the mascot "needs to look a little bit better").
const NEMESIS: Who = { label: "N", tone: "transparent", character: true };

const PILE: { q: string; by: Who; meta: string; x: string; y: number; r0: number; r1: number }[] = [
  { q: "What does the second law say about the entropy of an isolated system?", by: CLAUDE, meta: "Drafted by Claude, checked by you", x: "2%", y: 18, r0: -16, r1: -6 },
  { q: "Is a shop window display an offer, or an invitation to treat?", by: GPT, meta: "Drafted by ChatGPT from your Week 3 reading", x: "34%", y: 70, r0: 14, r1: 5 },
  { q: "Why does a heat engine need a cold reservoir?", by: NEMESIS, meta: "Asked by you, answered by Nemesis", x: "10%", y: 222, r0: -10, r1: 3 },
  { q: "What forced the Estates-General to meet in 1789?", by: YOU, meta: "Written by you", x: "36%", y: 300, r0: 18, r1: -4 },
  { q: "What does a unilateral offer need before it can be accepted?", by: NEMESIS, meta: "Suggested by Nemesis from the cards you missed", x: "18%", y: 420, r0: -12, r1: 2 },
];

const ORBIT: { name: string; who: Who; x: number; y: number; d: string; dd: string }[] = [
  { name: "Claude", who: CLAUDE, x: 16, y: 30, d: "6.2s", dd: "0s" },
  { name: "ChatGPT", who: GPT, x: 22, y: 74, d: "7s", dd: "-2s" },
  { name: "Cursor", who: { label: "C", tone: TONE.emerald }, x: 80, y: 28, d: "6.6s", dd: "-1s" },
  { name: "Your own notes", who: { label: "+", tone: "rgba(0,0,0,0.3)" }, x: 78, y: 74, d: "7.4s", dd: "-3s" },
];

const RULES = [
  "One idea per card",
  "Every card cites its source",
  "Scheduled with FSRS",
  "Checked before you see it",
  "Slides export to .pptx",
  "Guides export to .docx",
];

const TABLE: [string, string, string][] = [
  ["Flashcards", "Typed into Anki one at a time, the night before", "Drafted from the lecture by your agent, each card linked to its slide"],
  ["When to review", "A guess, or whenever there is time", "FSRS schedules each card for just before you would forget it"],
  ["Slides", "Copied into a template by hand", "A 12-slide summary, exported to .pptx"],
  ["Study guides", "Notes rewritten from scratch", "A guide where every claim points to its source, exported to .docx"],
  ["Trusting the output", "Hoping the AI got it right", "Every card is checked against the deck rules before it reaches you"],
];

const FAQ = [
  { q: "Do I need my own agent?", a: "No. Nemesis has its own AI that builds the same decks, slides and guides. Connecting Claude, ChatGPT or Cursor is optional." },
  { q: "What can I bring in?", a: "PDFs, Word, PowerPoint and Excel files, links, transcripts, photos of handwritten notes and lecture recordings. Nemesis reads seventeen formats." },
  { q: "What can Nemesis make from my files?", a: "Flashcards, tests, slides, mind maps and notes from your lectures. Each one links back to the page it came from." },
  { q: "Can I study with classmates?", a: "Yes. Share a space and choose whether each person can view it, comment on it or edit it." },
  { q: "How does Nemesis decide when I review?", a: "It uses FSRS, a spaced repetition scheduler that predicts when you are about to forget each card and brings it back just before you do." },
  { q: "Can I see where a card came from?", a: "Yes. Every card, slide and section of a guide points back to the page or slide it came from." },
  { q: "Is it only for one subject?", a: "No. Nemesis works for any course, from contract law to thermodynamics to history." },
];

function Initial({ who, className = "sn-who" }: { who: Who; className?: string }) {
  if (who.character) {
    return (
      <span className={`${className} sn-who-mark`} aria-hidden="true">
        <CharacterMark size={className === "sn-who" ? 20 : 40} />
      </span>
    );
  }
  return (
    <span className={className} style={{ background: who.tone }} aria-hidden="true">
      {who.label}
    </span>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  const hero = DEVICE_PHOTOS.deskLaptop;
  const tablet = DEVICE_PHOTOS.tabletCards;
  return (
    <div className="sn">
      <SnHeader />
      <main>
        {/* ── hero: eyebrow, one line of 67px, a short paragraph, one pill, then the film ─────── */}
        <section className="sn-hero">
          <p className="sn-eyebrow sn-load">Nemesis</p>
          <Words as="h1" now className="sn-h1" text="Where students and agents create together" />
          <p className="sn-sub sn-load sn-load-1">
            Bring Claude, ChatGPT or Cursor to your course. Your agent drafts the flashcards, slides and study guides with
            you. You check the work, and you learn it.
          </p>
          <div className="sn-actions sn-load sn-load-2">
            <a className="sn-btn sn-btn-solid nm-press" href="https://app.enternemesis.com/sign-up">
              Start free
            </a>
            <a className="sn-btn sn-btn-ghost" href="#together">
              Watch it work
            </a>
          </div>
          <div className="sn-hero-media sn-load sn-load-3">
            <DeviceShot
              className="sn-frame"
              photo={hero.src}
              size={hero.size}
              quad={hero.quad}
              screen={[1240, 800]}
              alt="A laptop on an oak desk running Nemesis, beside a notebook, a coral book and a mug"
              eager
            >
              <LoopVideo
                src="/showcase/together.mp4"
                poster="/showcase/together.webp"
                label="A student and Claude building a flashcard deck together in Nemesis"
              />
            </DeviceShot>
          </div>
        </section>

        <Marquee label="Used by real students at top universities" items={SCHOOLS} />

        {/* ── the product film on sand ─────────────────────────────────────────────────────── */}
        <section className="sn-band" id="together">
          <p className="sn-kicker">The workspace</p>
          <Words as="h2" className="sn-h2" text="Two minds on the same deck" />
          <TypeOn
            className="sn-lead"
            text="Your agent drafts the cards. Nemesis checks every one against its rules. You review what matters and grade what you know."
          />
          <div className="sn-art sn-show-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sn-art-img" src="/gradients/violet.webp" alt="" loading="lazy" decoding="async" />
            <Reveal kind="rise" className="sn-show">
              <div className="sn-frame sn-show-frame">
                <LoopVideo src="/showcase/board.mp4" poster="/showcase/board.webp" label="Agents and a student moving cards from draft to ready on a study board" />
              </div>
            </Reveal>
          </div>
          <Slots className="sn-works sn-works-band" cellClassName="sn-works-cell" count={6} items={WORKS} />
        </section>

        {/* ── the note taker, its own section. Owner, 2026-09-11: "make section for the note taker and one for
            deliverables". It comes first: the lecture is the material the deliverables are made from. ── */}
        <section className="sn-band" id="lecture-notes">
          <p className="sn-kicker">Note taker</p>
          <Words as="h2" className="sn-h2" text="Record the lecture. Keep the notes." />
          <TypeOn
            className="sn-lead"
            text="Press record from the chat box. Nemesis writes down what is said, then turns the transcript into a full page of notes: key ideas, examples to know and tips for the exam."
          />
          <div className="sn-art sn-show-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sn-art-img" src="/gradients/orange.webp" alt="" loading="lazy" decoding="async" />
            <Reveal kind="rise" className="sn-show">
              <div className="sn-frame sn-show-frame">
                <LoopVideo
                  src="/showcase/lecture.mp4"
                  poster="/showcase/lecture.webp"
                  label="A student records a contract law lecture from the chat box. The words are written down as they are said, then the transcript turns into notes"
                />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── the deliverables, as Quizlet shows them: a gradient card with a mock of each tool (owner, 2026-09-11) ── */}
        <section className="sn-tools" id="tools">
          <p className="sn-kicker">Study tools</p>
          <Words as="h2" className="sn-h2" text="Everything you need to study, made from your course" />
          <TypeOn
            className="sn-lead"
            text="Drop in a lecture, a reading or an exam date. Nemesis makes what you need to study, and every piece points back to its source."
          />
          <Deliverables />
        </section>

        {/* ── think together: cards from every author fall into one pile ────────────────────── */}
        <section className="sn-pair" id="decks">
          <div>
            <p className="sn-kicker">Think together</p>
            <Words as="h2" className="sn-h2" text="Every card shows who made it" />
            <TypeOn
              className="sn-lead"
              text="Cards come from your agent, from Nemesis, or from you. Each one keeps its author and its source, so you always know what to trust and what to check."
            />
          </div>
          <Reveal kind="drop" className="sn-pile">
            {PILE.map((c, i) => (
              <div
                key={c.q}
                className="nm-drop-card sn-pile-card"
                style={{ "--i": i, "--r0": `${c.r0}deg`, "--r1": `${c.r1}deg`, left: c.x, top: c.y } as CSSProperties}
              >
                <div className="nm-drop-face sn-flash">
                  <p className="sn-flash-q">{c.q}</p>
                  <p className="sn-flash-meta">
                    <Initial who={c.by} />
                    {c.meta}
                  </p>
                </div>
              </div>
            ))}
          </Reveal>
        </section>

        {/* ── agents: bubbles around Nemesis, and the rules everything passes ──────────────── */}
        <section className="sn-band" id="agents" style={{ marginTop: 0 }}>
          <p className="sn-kicker">Bring your own agent</p>
          <Words as="h2" className="sn-h2" text="Works with the agent you already use" />
          <TypeOn
            className="sn-lead"
            text="Claude, ChatGPT and Cursor connect to Nemesis and use its tools: the reader, the deck builder, slides and study guides. Or use Nemesis AI on its own."
          />
          <Reveal kind="pop" className="sn-orbit sn-orbit-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sn-art-img" src="/gradients/lime.webp" alt="" loading="lazy" decoding="async" />
            <svg className="sn-orbit-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {ORBIT.map((o) => (
                <line key={o.name} x1={o.x} y1={o.y} x2={50} y2={50} />
              ))}
            </svg>
            <div className="sn-bubble-at" style={{ left: "50%", top: "50%" }}>
              <div className="nm-pop-i" style={{ "--i": 0 } as CSSProperties}>
                <div className="sn-bubble sn-bubble-hub" style={{ "--d": "8s" } as CSSProperties}>
                  <Mascot size={64} />
                  <span className="sn-bubble-label">Nemesis</span>
                </div>
              </div>
            </div>
            {ORBIT.map((o, i) => (
              <div key={o.name} className="sn-bubble-at" style={{ left: `${o.x}%`, top: `${o.y}%` }}>
                <div className="nm-pop-i" style={{ "--i": i + 1 } as CSSProperties}>
                  <div className="sn-bubble" style={{ "--d": o.d, "--dd": o.dd } as CSSProperties}>
                    <Initial who={o.who} className="sn-initial" />
                    <span className="sn-bubble-label">{o.name}</span>
                  </div>
                </div>
              </div>
            ))}
          </Reveal>
          <Reveal kind="rise" className="sn-rules">
            <p className="sn-rules-title">Rules every output passes</p>
            <ul className="sn-rules-list">
              {RULES.map((r) => (
                <li key={r}>
                  <Tick />
                  {r}
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        {/* ── two windows lying back, then settling flat ────────────────────────────────────── */}
        <section className="sn-devices">
          <p className="sn-kicker">Built for the whole term</p>
          <Words as="h2" className="sn-h2" text="Your deck remembers what you missed" />
          <div className="sn-art sn-devices-art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sn-art-img" src="/gradients/azure.webp" alt="" loading="lazy" decoding="async" />
            <div className="sn-devices-stage">
              <Reveal kind="tilt" className="sn-dev-1">
                <div className="nm-tilt-body">
                  <WorkspaceMock />
                </div>
              </Reveal>
              <Reveal kind="tilt-b" className="sn-dev-2">
                <div className="nm-tilt-body">
                  <DeckMock />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── what changes ──────────────────────────────────────────────────────────────────── */}
        <section className="sn-table-sec">
          <p className="sn-kicker">Before and after</p>
          <Words as="h2" className="sn-h2" text="What changes when your agent can use Nemesis" />
          <div className="sn-table">
            <div className="sn-row sn-row-h">
              <span />
              <span>On your own</span>
              <span>With your agent and Nemesis</span>
            </div>
            {TABLE.map(([what, before, after], i) => (
              <Reveal key={what} kind="rise" className="sn-row" style={{ transitionDelay: `${i * 70}ms` }}>
                <b>{what}</b>
                <span className="sn-old">{before}</span>
                <span>{after}</span>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── closing ───────────────────────────────────────────────────────────────────────── */}
        <section className="sn-close">
          <div className="sn-close-in">
            <div>
              <Words as="h2" className="sn-h2" text="Bring your agent. Bring your course." />
              <p className="sn-lead">Start free with Nemesis AI, then connect the agent you already use.</p>
              <div className="sn-actions">
                <a className="sn-btn sn-btn-solid nm-press" href="https://app.enternemesis.com/sign-up">
                  Start free
                </a>
              </div>
            </div>
            <Reveal kind="rise" className="sn-close-art">
              <DeviceShot
                className="sn-frame"
                photo={tablet.src}
                size={tablet.size}
                quad={tablet.quad}
                screen={[1040, 750]}
                alt="A tablet lying on a desk showing a Nemesis flashcard deck, with index cards, a sticky note and earphones"
              >
                <div className="sn-tablet-screen">
                  <DeckMock />
                </div>
              </DeviceShot>
            </Reveal>
          </div>
        </section>

        <SnFaq items={FAQ} />
      </main>
      <SnFoot />
    </div>
  );
}
