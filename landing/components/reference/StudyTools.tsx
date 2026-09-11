/**
 * The deliverables section's cards.
 *
 * Owner, 2026-09-11: "make section for the note taker and one for deliverables like Quizlet does, basically
 * deliverables should be background gradient card with UI mockup (skeleton load etc) for flashcards (use only x and
 * check for flashcard) and tests and slides and mind map". Earlier the same day: "just show the deliverables" and
 * "Remove video summery and study packet and podcast and course Map".
 *
 * Then: "Go to Quizlet com but not the webapp, look at the landing page". Its "How do you want to study?" row, measured
 * that day at 1470 wide: cards 310x390, radius 24, 32px apart, the title 24/32 bold and centred 19px from the top, the
 * art filling the card from 70px down. Ours keep that shape with one approved rendered gradient (public/gradients) as
 * the ground and a wordless mock of the tool, drawn in skeleton bars that shimmer as if loading. Wordless on purpose:
 * invented text inside a mock reads as a screenshot of a lecture that does not exist.
 *
 * 🔴 A FLASHCARD IS GRADED WITH ✗ OR ✓ AND NOTHING ELSE. No Again/Hard/Good/Easy row. lib/home.test.ts holds it.
 * 🔴 EVERY ANIMATION IS CSS AND STOPS UNDER prefers-reduced-motion, so the resting state is the finished picture.
 */
import type { ReactElement } from "react";

import { Reveal } from "./motion/Motion";

type Art = "violet" | "emerald" | "azure" | "coral";

function Sk({ w, className = "" }: { w: string; className?: string }) {
  return <span className={`sn-sk ${className}`.trim()} style={{ width: w }} />;
}

function FlashcardsMock() {
  return (
    <div className="sn-mk sn-mk-cards" aria-hidden="true">
      <div className="sn-mk-stack">
        <span className="sn-mk-card sn-mk-card-3" />
        <span className="sn-mk-card sn-mk-card-2" />
        <div className="sn-mk-card sn-mk-card-1">
          <Sk w="26%" className="sn-sk-sm" />
          <Sk w="84%" />
          <Sk w="60%" />
        </div>
      </div>
      <div className="sn-mk-grade">
        <span className="sn-mk-btn sn-mk-no">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l8 8M14 6l-8 8" />
          </svg>
        </span>
        <span className="sn-mk-btn sn-mk-yes">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.5 10.5l3.5 3.5 7.5-8" />
          </svg>
        </span>
      </div>
    </div>
  );
}

const OPTIONS = ["64%", "48%", "72%", "55%"];

function TestMock() {
  return (
    <div className="sn-mk sn-mk-test" aria-hidden="true">
      <span className="sn-mk-prog">
        <i />
      </span>
      <Sk w="90%" />
      <Sk w="56%" />
      <ul className="sn-mk-opts">
        {OPTIONS.map((w, i) => (
          <li key={w} className={i === 2 ? "sn-mk-opt is-right" : "sn-mk-opt"}>
            <i className="sn-mk-radio" />
            <Sk w={w} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SlidesMock() {
  return (
    <div className="sn-mk sn-mk-slides" aria-hidden="true">
      <div className="sn-mk-slide">
        <Sk w="52%" className="sn-sk-lg" />
        <div className="sn-mk-slide-body">
          <div className="sn-mk-slide-lines">
            <Sk w="94%" />
            <Sk w="76%" />
            <Sk w="86%" />
          </div>
          <span className="sn-mk-slide-img" />
        </div>
      </div>
      <div className="sn-mk-thumbs">
        <span className="sn-mk-thumb" />
        <span className="sn-mk-thumb" />
        <span className="sn-mk-thumb" />
        <span className="sn-mk-thumb" />
        <span className="sn-mk-ring" />
      </div>
    </div>
  );
}

/** Branch nodes in percent of the map box; the links are drawn in a 100 by 90 box, the same 10:9 shape. */
const BRANCHES = [
  { x: 24, y: 17, w: "38px" },
  { x: 76, y: 24, w: "46px" },
  { x: 22, y: 80, w: "44px" },
  { x: 77, y: 84, w: "34px" },
];

function MindMapMock() {
  return (
    <div className="sn-mk sn-mk-map" aria-hidden="true">
      <svg className="sn-mk-links" viewBox="0 0 100 90">
        {BRANCHES.map((b) => {
          const y = (b.y / 100) * 90;
          const mid = (50 + b.x) / 2;
          return <path key={b.x} pathLength={1} d={`M50 45C${mid} 45 ${mid} ${y} ${b.x} ${y}`} />;
        })}
      </svg>
      <span className="sn-mk-node is-root" style={{ left: "50%", top: "50%" }}>
        <Sk w="54px" />
      </span>
      {BRANCHES.map((b, i) => (
        <span key={b.x} className="sn-mk-node" style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: `${0.3 + i * 0.18}s` }}>
          <Sk w={b.w} />
        </span>
      ))}
    </div>
  );
}

/** `ink` puts a dark title on the one light ground (azure measures 70,179,234 on average; white on it is 2.3:1). */
export const DELIVERABLES: { name: string; art: Art; ink?: boolean; line: string; Mock: () => ReactElement }[] = [
  { name: "Flashcards", art: "violet", line: "Cards from your lecture, scheduled with FSRS.", Mock: FlashcardsMock },
  { name: "Tests", art: "emerald", line: "A practice test from your material that marks itself.", Mock: TestMock },
  { name: "Slides", art: "azure", ink: true, line: "A slide summary of the lecture, exported to .pptx.", Mock: SlidesMock },
  { name: "Mind map", art: "coral", line: "The ideas in a lecture, and how they connect.", Mock: MindMapMock },
];

export function Deliverables() {
  return (
    <ul className="sn-dl">
      {DELIVERABLES.map(({ name, art, ink, line, Mock }, i) => (
        <Reveal key={name} as="li" kind="rise" className="sn-dl-item" style={{ transitionDelay: `${i * 70}ms` }}>
          <div className={ink ? "sn-dl-card is-ink" : "sn-dl-card"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/gradients/${art}.webp`} alt="" loading="lazy" decoding="async" />
            <p className="sn-dl-title">{name}</p>
            <Mock />
          </div>
          <p className="sn-dl-line">{line}</p>
        </Reveal>
      ))}
    </ul>
  );
}
