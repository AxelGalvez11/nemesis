import type { Metadata } from "next";

import { Mascot } from "@/components/home/Mascot";
import { AGENT, Avatar } from "@/components/reference/agents";
import { LoopVideo } from "@/components/reference/device/DeviceShot";
import { FAQ } from "@/components/reference/faq";
import { DeckMock, SchemaMock } from "@/components/reference/mockups/Mockups";
import { Reveal, TypeOn, Words } from "@/components/reference/motion/Motion";
import { SnFaq, SnFoot, SnHeader } from "@/components/reference/SanaChrome";

import "../sana.css";
import "../canvas.css";

export const metadata: Metadata = { title: "Nemesis · G · Canvas" };

/**
 * Variation G. notion.com's energy in our words: bold type, the canvas film straight under the
 * headline, and the character looking over the top of the frame at whoever is reading.
 */

const ASKS = [
  { text: "Turn Lecture 6 into a deck", agent: AGENT.claude, meta: "42 cards" },
  { text: "Make slides for Monday's seminar", agent: AGENT.chatgpt, meta: "12 slides" },
  { text: "Write a study guide on offer and acceptance", agent: AGENT.nemesis, meta: "6 sections" },
  { text: "Quiz me on the cards I missed", agent: AGENT.nemesis, meta: "10 questions" },
  { text: "Explain this diagram in plain words", agent: AGENT.claude, meta: "From slide 22" },
];

const STATS: [string, string][] = [
  ["17", "formats read, from slide decks to handwriting"],
  ["3", "things to study from: decks, slides and guides"],
  ["1", "canvas where every piece links to its source"],
];

export default function VariantCanvas() {
  return (
    <div className="sn">
      <SnHeader />
      <main>
        <section className="vg-hero">
          <Words as="h1" now className="vg-h1" text="One canvas for you and every agent" />
          <p className="vg-sub sn-load sn-load-1">
            Drop in your course. Claude, ChatGPT and Nemesis add decks, slides and answers next to your notes, and every one links
            back to the page it came from.
          </p>
          <div className="sn-actions sn-load sn-load-2">
            <a className="sn-btn sn-btn-solid vg-btn nm-press" href="/app">
              Start free
            </a>
            <a className="sn-btn sn-btn-ghost vg-btn" href="#asks">
              See what agents do
            </a>
          </div>
          <div className="vg-stage sn-load sn-load-3">
            <div className="vg-peek" aria-hidden="true">
              <Mascot size={150} />
            </div>
            <div className="sn-frame vg-frame">
              <LoopVideo src="/showcase/board.mp4" poster="/showcase/board.webp" label="Agents and a student adding a deck, slides, a note and a study guide to one canvas" />
            </div>
          </div>
        </section>

        <section className="vg-asks" id="asks">
          <Words as="h2" className="vg-h2" text="Ask for the work, then learn from it" />
          <div className="vg-ask-row">
            {ASKS.map((a, i) => (
              <Reveal key={a.text} kind="rise" className="vg-ask" style={{ transitionDelay: `${i * 70}ms` }}>
                <Avatar agent={a.agent} size={28} />
                <p className="vg-ask-text">{a.text}</p>
                <span className="vg-ask-meta">
                  {a.agent.name} · {a.meta}
                </span>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="vg-duo">
          <Reveal kind="rise" className="vg-card">
            <div>
              <h3>Your agents work side by side</h3>
              <p>Claude drafts the deck while ChatGPT builds the slides, and both land on the canvas as they finish.</p>
            </div>
            <div className="vg-card-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/photos/notes-flatlay.webp" alt="" loading="lazy" />
              <div className="vg-card-win">
                <DeckMock />
              </div>
            </div>
          </Reveal>
          <Reveal kind="rise" className="vg-card" style={{ transitionDelay: "90ms" }}>
            <div>
              <h3>Nemesis checks the work</h3>
              <p>Every card has to pass the deck rules. A card with no source, or more than one idea, goes back to the agent that wrote it.</p>
            </div>
            <div className="vg-card-art">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/photos/card-board.webp" alt="" loading="lazy" />
              <div className="vg-card-win vg-card-win-wide">
                <SchemaMock />
              </div>
            </div>
          </Reveal>
        </section>

        <section className="vg-stats">
          {STATS.map(([n, label], i) => (
            <Reveal key={n} kind="rise" style={{ transitionDelay: `${i * 90}ms` }}>
              <p className="vg-stat-n">{n}</p>
              <p className="vg-stat-l">{label}</p>
            </Reveal>
          ))}
        </section>

        <section className="sn-band vg-film">
          <p className="sn-kicker">A deck in the making</p>
          <Words as="h2" className="vg-h2" text="Watch you and Claude build one deck" />
          <TypeOn
            className="sn-lead"
            text="You ask. Claude reads the lecture and deals the cards. You turn one over and grade it, and Nemesis adds the card you missed last week."
          />
          <Reveal kind="rise" className="vg-film-frame">
            <div className="sn-frame" style={{ aspectRatio: "1860 / 1200" }}>
              <LoopVideo src="/showcase/together.mp4" poster="/showcase/together.webp" label="A student and Claude building a flashcard deck together in Nemesis" />
            </div>
          </Reveal>
        </section>

        <section className="vg-close">
          <Words as="h2" className="vg-h1" text="Start with one lecture" />
          <p className="vg-sub">Free to start. Your agent is welcome too.</p>
          <div className="sn-actions">
            <a className="sn-btn sn-btn-solid vg-btn nm-press" href="/app">
              Start free
            </a>
          </div>
        </section>

        <SnFaq items={FAQ} />
      </main>
      <SnFoot />
    </div>
  );
}
