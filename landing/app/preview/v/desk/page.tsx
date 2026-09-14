import type { CSSProperties } from "react";
import type { Metadata } from "next";

import { AGENT, Avatar } from "@/components/reference/agents";
import { DeviceShot, LoopVideo } from "@/components/reference/device/DeviceShot";
import { DEVICE_PHOTOS } from "@/components/reference/device/photos";
import { FAQ } from "@/components/reference/faq";
import { DeckMock, WorkspaceMock } from "@/components/reference/mockups/Mockups";
import { Reveal, Rotator, Slots, TypeOn, Words } from "@/components/reference/motion/Motion";
import { SnFaq, SnFoot, SnHeader } from "@/components/reference/SanaChrome";

import "../sana.css";
import "../desk.css";

export const metadata: Metadata = { title: "Nemesis · F · Desk" };

/**
 * Variation F. The photograph leads. The hero is split: the agent's name turns over inside the
 * headline, and the laptop in the photograph runs the real coded window, not a picture of one.
 */

const ROT = [AGENT.claude, AGENT.chatgpt, AGENT.cursor, AGENT.nemesis].map((a) => (
  <span key={a.name} className="vf-agent">
    <Avatar agent={a} size={56} />
    {a.name}
  </span>
));

const FILES = [
  { name: "Lecture 6.pdf", kind: "doc" },
  { name: "Week 3 reading.docx", kind: "doc" },
  { name: "Seminar recording.m4a", kind: "audio" },
  { name: "Notes, 14 pages", kind: "note" },
];

const FORMATS = ["PDF", "Slides", "Word", "Handwriting", "Recordings", "Markdown", "Web pages", "Photos of notes", "Plain text", "Images"];

const TILES = [
  { src: "/photos/laptop-macro.webp", span: "vf-span-7", title: "Every card cites its slide", text: "Open a card and see the exact slide it was written from." },
  { src: "/photos/study-guide.webp", span: "vf-span-5", title: "Guides that point to sources", text: "Each section of a study guide links to the page behind it." },
  { src: "/photos/cards-lime.webp", span: "vf-span-5", title: "White cards, one idea each", text: "The deck rules keep every card short, sourced and about one thing." },
  { src: "/photos/card-board.webp", span: "vf-span-7", title: "Ideas that stay connected", text: "Notes, decks and answers sit on one canvas beside the lecture." },
];

function FileIcon({ kind }: { kind: string }) {
  const common = { viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, "aria-hidden": true } as const;
  if (kind === "audio")
    return (
      <svg {...common}>
        <path d="M3 9.5v-3M5.5 11V5M8 13V3M10.5 11V5M13 9.5v-3" strokeLinecap="round" />
      </svg>
    );
  if (kind === "note")
    return (
      <svg {...common}>
        <path d="M3 13l1-3.5L11 2.5l2.5 2.5-7 7z" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="M4 1.8h5.2L12.5 5v9.2H4z" />
      <path d="M9 1.8V5h3.5" />
    </svg>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function VariantDesk() {
  const cards = DEVICE_PHOTOS.laptopCards;
  const desk = DEVICE_PHOTOS.sharedDesk;
  return (
    <div className="sn">
      <SnHeader />
      <main>
        <section className="vf-hero">
          <div className="vf-copy">
            <p className="sn-eyebrow sn-load">Nemesis</p>
            <h1 className="vf-h1" aria-label="Learn alongside Claude, ChatGPT, Cursor or Nemesis">
              <span className="nm-words" data-nm="now" aria-hidden="true">
                <span className="nm-w" style={{ "--w": 0 } as CSSProperties}>
                  Learn
                </span>{" "}
                <span className="nm-w" style={{ "--w": 1 } as CSSProperties}>
                  alongside
                </span>
              </span>
              <span className="vf-rot sn-load sn-load-1" aria-hidden="true">
                <Rotator items={ROT} interval={2400} />
              </span>
            </h1>
            <p className="vf-sub sn-load sn-load-1">
              Your agent reads the course with you and builds the flashcards, slides and study guides. You turn the cards,
              grade what you know, and ask about what you don&apos;t.
            </p>
            <div className="sn-actions sn-load sn-load-2">
              <a className="sn-btn sn-btn-solid nm-press" href="/app">
                Start free
              </a>
              <a className="sn-btn sn-btn-ghost" href="#how">
                See how it works
              </a>
            </div>
            <ul className="vf-proof sn-load sn-load-3">
              <li>
                <Tick />
                Scheduled with FSRS
              </li>
              <li>
                <Tick />
                Slides as .pptx
              </li>
              <li>
                <Tick />
                Guides as .docx
              </li>
            </ul>
          </div>
          <div className="sn-load sn-load-2">
            <DeviceShot
              className="sn-frame"
              photo={cards.src}
              size={cards.size}
              quad={cards.quad}
              screen={[1240, 800]}
              alt="A silver laptop on an oak desk running Nemesis, with white index cards fanned out in front of it"
              eager
            >
              <div className="vf-screen">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/gradients/azure.webp" alt="" />
                <WorkspaceMock />
              </div>
            </DeviceShot>
          </div>
        </section>

        <section className="vf-rows" id="how">
          <div className="vf-row">
            <Reveal kind="rise" className="vf-row-copy">
              <p className="vf-num">01</p>
              <h2 className="vf-h3">Bring the whole course</h2>
              <p className="vf-text">
                Lecture slides, readings, handwritten notes and recordings. Nemesis reads seventeen formats and keeps every page.
              </p>
            </Reveal>
            <Reveal kind="pop" className="vf-art nm-zoom">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="nm-zoom-bg" src="/photos/notes-flatlay.webp" alt="An open notebook of diagrams, a stack of index cards and pens on linen" loading="lazy" />
              <div className="vf-files">
                {FILES.map((f, i) => (
                  <span key={f.name} className="vf-file nm-pop-i" style={{ "--i": i } as CSSProperties}>
                    <FileIcon kind={f.kind} />
                    {f.name}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>

          <div className="vf-row vf-flip">
            <Reveal kind="rise" className="vf-row-copy">
              <p className="vf-num">02</p>
              <h2 className="vf-h3">Your agent builds it with you</h2>
              <p className="vf-text">
                Claude, ChatGPT or Nemesis drafts the deck while you watch. Every card is checked against the deck rules before it
                reaches you.
              </p>
            </Reveal>
            <Reveal kind="rise" className="vf-art vf-art-video">
              <LoopVideo src="/showcase/together.mp4" poster="/showcase/together.webp" label="A student and Claude building a flashcard deck together in Nemesis" />
            </Reveal>
          </div>

          <div className="vf-row">
            <Reveal kind="rise" className="vf-row-copy">
              <p className="vf-num">03</p>
              <h2 className="vf-h3">Then you learn it</h2>
              <p className="vf-text">Turn the cards and grade what you know. FSRS brings each card back just before you would forget it.</p>
            </Reveal>
            <Reveal kind="tilt" className="vf-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/photos/hourglass-cards.webp" alt="An hourglass beside a stack of white index cards" loading="lazy" />
              <div className="nm-tilt-body vf-float-panel">
                <DeckMock />
              </div>
            </Reveal>
          </div>
        </section>

        <section className="sn-band vf-canvas">
          <p className="sn-kicker">One canvas</p>
          <Words as="h2" className="sn-h2" text="Everything links back to the lecture" />
          <TypeOn
            className="sn-lead"
            text="Decks, slides, notes and answers sit beside the source they came from, so you can always check where something was learned."
          />
          <Reveal kind="rise" className="vf-wide">
            <div className="sn-frame">
              <LoopVideo src="/showcase/board.mp4" poster="/showcase/board.webp" label="Agents and a student adding a deck, slides, a note and a study guide to one canvas" />
            </div>
          </Reveal>
        </section>

        <section className="vf-formats-sec">
          <p className="sn-kicker">Seventeen formats</p>
          <Words as="h2" className="sn-h2" text="Bring whatever you study from" />
          <Slots className="vf-formats" cellClassName="vf-format" count={8} items={FORMATS} />
        </section>

        <section className="vf-bento">
          {TILES.map((t, i) => (
            <Reveal key={t.src} kind="rise" className={`vf-tile nm-zoom ${t.span}`} style={{ transitionDelay: `${(i % 2) * 90}ms` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="nm-zoom-bg" src={t.src} alt="" loading="lazy" />
              <p className="vf-tile-copy">
                <b>{t.title}</b>
                <span>{t.text}</span>
              </p>
            </Reveal>
          ))}
        </section>

        <section className="sn-close">
          <div className="sn-close-in">
            <div>
              <Words as="h2" className="sn-h2" text="Pull up a chair for your agent" />
              <p className="sn-lead">Nemesis is free to start. Bring one lecture and see what you and your agent make of it.</p>
              <div className="sn-actions">
                <a className="sn-btn sn-btn-solid nm-press" href="/app">
                  Start free
                </a>
              </div>
            </div>
            <Reveal kind="rise" className="sn-close-art vf-close-art">
              <DeviceShot
                className="sn-frame"
                photo={desk.src}
                size={desk.size}
                quad={desk.quad}
                screen={[1280, 800]}
                alt="A shared desk with a laptop showing the Nemesis canvas, a blue notebook, index cards and a mug"
              >
                <LoopVideo src="/showcase/board.mp4" poster="/showcase/board.webp" label="The Nemesis canvas filling with a deck, slides and answers" />
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
