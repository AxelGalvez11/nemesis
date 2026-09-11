import type { CSSProperties } from "react";

import { Mascot } from "@/components/home/Mascot";
import { DeviceShot, LoopVideo } from "@/components/reference/device/DeviceShot";
import { DEVICE_PHOTOS } from "@/components/reference/device/photos";
import { CharacterMark } from "@/components/reference/agents";
import { Marquee } from "@/components/reference/Marquee";
import { Collaborate, Deliverables } from "@/components/reference/StudyTools";
import { DeckMock } from "@/components/reference/mockups/Mockups";
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
 * OWNER, LATER 2026-09-11: the hero film "looks glitchy in beginning, it should showcase chat (using our new sana inspired
 * design)", so the laptop plays showcase-chat.html; remove "the your deck remembers what you missed section" and "that
 * rules every output passes card"; "add a section in deliverables for collaborate with friends and agents ... Use actual
 * agent logos"; the agents section becomes "connect to apps you already use ... include Gmail, Google Calendar"; and
 * Before and after talks about "the quality of source grounded notes and flashcards, and special skills for notes and
 * others for premium promise". WHAT IS REAL there: every app shown is in the connector catalogue
 * (apps/web/lib/workspace/composio-apps.ts), but since 2026-09-07 the app offers only Google Calendar; sharing a deck is
 * built (app/shared/[token]), agents working inside a shared deck are not; the skills exist for everyone today
 * (lib/workspace/chat-skills.ts), and putting them on the paid plan is the promise.
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

type Who = { label: string; tone: string; character?: boolean; logo?: string };
// Agents are their companies' own marks (public/brand/agents, see PROVENANCE.md). Owner, 2026-09-11: "Use actual agent logos".
const CLAUDE: Who = { label: "C", tone: TONE.violet, logo: "/brand/agents/claude.svg" };
const GPT: Who = { label: "G", tone: TONE.azure, logo: "/brand/agents/chatgpt.svg" };
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

/**
 * The apps and agents around Nemesis. Owner, 2026-09-11: "make it more about connect to apps you already use and also
 * include Gmail, Google Calendar, add other related apps so it feels like a lot". 🔴 ONLY APPS IN THE CONNECTOR
 * CATALOGUE (apps/web/lib/workspace/composio-apps.ts) and the three agents, each with its owner's own mark from
 * public/brand (the app's own copies, see each folder's PROVENANCE.md). lib/home.test.ts holds both.
 */
const APP_RINGS: { name: string; logo: string }[][] = [
  [
    { name: "Claude", logo: "/brand/agents/claude.svg" },
    { name: "Gmail", logo: "/brand/google/gmail.svg" },
    { name: "ChatGPT", logo: "/brand/agents/chatgpt.svg" },
    { name: "Google Calendar", logo: "/brand/google/calendar.svg" },
    { name: "Cursor", logo: "/brand/agents/cursor.svg" },
    { name: "Google Drive", logo: "/brand/google/drive.svg" },
  ],
  [
    { name: "Canvas LMS", logo: "/brand/apps/canvas.svg" },
    { name: "Notion", logo: "/brand/apps/notion.svg" },
    { name: "Google Docs", logo: "/brand/google/docs.svg" },
    { name: "Zoom", logo: "/brand/apps/zoom.svg" },
    { name: "Google Sheets", logo: "/brand/apps/googlesheets.svg" },
    { name: "Outlook", logo: "/brand/apps/outlook.svg" },
    { name: "Google Classroom", logo: "/brand/apps/google_classroom.svg" },
    { name: "OneDrive", logo: "/brand/apps/one_drive.svg" },
  ],
];
/** Two ellipses around the hub, in percent of the panel. 🔴 The inner ring starts at -60 degrees so none of its six sits
 *  straight above or below the hub: at -90 the bottom one crowded the hub's own "Nemesis" label. The outer ring's top and
 *  bottom are far enough away to take the vertical slots. */
const RINGS = [
  { rx: 23, ry: 24, from: -60 },
  { rx: 41, ry: 36, from: -90 },
];
const APPS = APP_RINGS.flatMap((ring, r) =>
  ring.map((app, i) => {
    const a = ((RINGS[r].from + (360 / ring.length) * i) * Math.PI) / 180;
    const k = r * 6 + i;
    return {
      ...app,
      x: Math.round((50 + RINGS[r].rx * Math.cos(a)) * 10) / 10,
      y: Math.round((50 + RINGS[r].ry * Math.sin(a)) * 10) / 10,
      d: `${(6 + (k % 4) * 0.4).toFixed(1)}s`,
      dd: `-${((k * 0.7) % 5).toFixed(1)}s`,
    };
  }),
);

/**
 * Owner, 2026-09-11: "talk about the quality of source grounded notes and flashcards, and special skills for notes and
 * others for premium promise". The skills are real (apps/web/lib/workspace/chat-skills.ts: Lecture intake, Syllabus
 * intake, Socratic tutoring, Quantitative check; test craft for exam questions); keeping them for the paid plan is the
 * promise, and it is not built.
 */
const TABLE: { what: string; before: string; after: string; premium?: true }[] = [
  { what: "Notes", before: "A summary that sounds right, with nothing to check it against", after: "Notes from your own lectures and readings, every line linked to the page it came from" },
  { what: "Flashcards", before: "Vague cards that mix three ideas", after: "One idea per card, each linked to its source and checked before you see it" },
  { what: "When your sources are silent", before: "A plausible guess, stated as fact", after: "Nemesis tells you your sources do not cover it" },
  { what: "Review", before: "Whenever there is time", after: "FSRS brings each card back just before you would forget it" },
  { what: "Skills for notes", before: "One way of writing for every class", after: "Lecture notes and syllabus breakdowns written the way your course needs", premium: true },
  { what: "Skills for studying", before: "The answer, handed over", after: "A Socratic tutor, step-by-step maths checks and exam-style questions", premium: true },
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
  if (who.logo) {
    return (
      <span className={`${className} sn-who-logo`} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={who.logo} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }
  return (
    <span className={className} style={{ background: who.tone }} aria-hidden="true">
      {who.label}
    </span>
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
                src="/showcase/chat.mp4"
                poster="/showcase/chat.webp"
                label="A student asks Nemesis why the Roman Republic fell, gets an answer that cites its sources, and checks a flashcard made from it"
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
          <Collaborate />
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

        {/* ── apps and agents: connect the apps you already use (owner, 2026-09-11) ───────────────── */}
        <section className="sn-band" id="agents" style={{ marginTop: 0 }}>
          <p className="sn-kicker">Apps and agents</p>
          <Words as="h2" className="sn-h2" text="Connect the apps you already use" />
          <TypeOn
            className="sn-lead"
            text="Bring in your mail, calendar, drive, class pages and notes, and bring Claude, ChatGPT or Cursor to work in Nemesis with you."
          />
          <Reveal kind="pop" className="sn-orbit sn-orbit-art sn-apps">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="sn-art-img" src="/gradients/lime.webp" alt="" loading="lazy" decoding="async" />
            <svg className="sn-orbit-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {APPS.map((a) => (
                <line key={a.name} x1={a.x} y1={a.y} x2={50} y2={50} />
              ))}
            </svg>
            <div className="sn-bubble-at sn-apps-hub" style={{ left: "50%", top: "50%" }}>
              <div className="nm-pop-i" style={{ "--i": 0 } as CSSProperties}>
                <div className="sn-bubble sn-bubble-hub" style={{ "--d": "8s" } as CSSProperties}>
                  <Mascot size={64} />
                  <span className="sn-bubble-label">Nemesis</span>
                </div>
              </div>
            </div>
            {APPS.map((a, i) => (
              <div key={a.name} className="sn-bubble-at" style={{ left: `${a.x}%`, top: `${a.y}%` }}>
                <div className="nm-pop-i" style={{ "--i": i + 1 } as CSSProperties}>
                  <div className="sn-bubble is-app" style={{ "--d": a.d, "--dd": a.dd } as CSSProperties}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="sn-app-logo" src={a.logo} alt="" loading="lazy" decoding="async" />
                    <span className="sn-bubble-label">{a.name}</span>
                  </div>
                </div>
              </div>
            ))}
          </Reveal>
        </section>

        {/* ── what changes ──────────────────────────────────────────────────────────────────── */}
        <section className="sn-table-sec">
          <p className="sn-kicker">Before and after</p>
          <Words as="h2" className="sn-h2" text="Notes and flashcards that come from your sources" />
          <div className="sn-table">
            <div className="sn-row sn-row-h">
              <span />
              <span>A general AI chat</span>
              <span>Nemesis</span>
            </div>
            {TABLE.map((row, i) => (
              <Reveal key={row.what} kind="rise" className="sn-row" style={{ transitionDelay: `${i * 70}ms` }}>
                <b>{row.what}</b>
                <span className="sn-old">{row.before}</span>
                <span>
                  {row.premium ? <span className="sn-tag">Premium</span> : null}
                  {row.after}
                </span>
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
