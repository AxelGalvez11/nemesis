import type { Metadata } from "next";

import { Mascot } from "@/components/home/Mascot";
import { squirclePath } from "@/components/reference/agents";
import { AutoTabs } from "@/components/reference/AutoTabs";
import { LoopVideo } from "@/components/reference/device/DeviceShot";
import { FAQ } from "@/components/reference/faq";
import { ArtGround, DeckMock, SchemaMock, WorkspaceMock } from "@/components/reference/mockups/Mockups";
import { Reveal, TypeOn, Words } from "@/components/reference/motion/Motion";
import { SnFaq, SnFoot, SnHeader } from "@/components/reference/SanaChrome";

import "../sana.css";
import "../session.css";

export const metadata: Metadata = { title: "Nemesis · H · Session" };

/**
 * Variation H. x.ai/bot's page, section for section, in our words: agents you message like
 * classmates, each with a job, and the character itself doing the introducing.
 */

const JOBS = [
  {
    label: "Deck builder",
    agent: "claude" as const,
    lines: [
      { me: true, text: "Make cards from Lecture 6, only the second law." },
      { text: "Read 38 slides and drafted 24 cards, one idea each, every one linked to its slide." },
      { text: "Three came back from the rules check without a source. Fixed and checked again." },
    ],
  },
  {
    label: "Slide maker",
    agent: "chatgpt" as const,
    lines: [
      { me: true, text: "I present the French Revolution on Monday. Ten minutes." },
      { text: "Twelve slides: the causes, 1789, the Terror and what changed, with notes on each." },
      { text: "Exported to .pptx and saved next to your notes." },
    ],
  },
  {
    label: "Study guide",
    agent: "nemesis" as const,
    lines: [
      { me: true, text: "Write me a guide to offer and acceptance." },
      { text: "Six sections, from invitations to treat to counter-offers. Every claim cites the reading." },
      { text: "Exported to .docx. Want cards from it too?" },
    ],
  },
  {
    label: "Quiz",
    agent: "nemesis" as const,
    lines: [
      { me: true, text: "Quiz me on what I missed this week." },
      { text: "Ten questions from the fourteen cards you got wrong. First: is entropy conserved in an isolated system?" },
      { me: true, text: "No. It can stay the same or go up, never down." },
    ],
  },
];

const OUTLINE = squirclePath(205, 180, 200, 175);

export default function VariantSession() {
  return (
    <div className="sn">
      <SnHeader />
      <main>
        <section className="vh-hero">
          <a className="vh-pill sn-load" href="#agents">
            New: connect your own agent <span aria-hidden="true">→</span>
          </a>
          <Words as="h1" now className="vh-h1" text="Meet your study agents" />
          <p className="vh-sub sn-load sn-load-1">
            Claude, ChatGPT and Nemesis work through your course with you. They read, draft, check and quiz. You decide what
            sticks.
          </p>
          <div className="sn-actions sn-load sn-load-2">
            <a className="sn-btn sn-btn-solid nm-press" href="/app">
              Start free
            </a>
            <a className="sn-btn sn-btn-ghost" href="/pricing">
              See pricing
            </a>
          </div>
          <div className="vh-stage sn-load sn-load-3">
            <ArtGround name="orange" className="vh-ground">
              <WorkspaceMock />
            </ArtGround>
          </div>
        </section>

        <section className="vh-wrap" id="agents">
          <Reveal kind="rise" className="vh-message">
            <div className="vh-message-copy">
              <h2 className="vh-h2">Message your agents like classmates</h2>
              <p className="vh-text">
                Ask in plain words. Your agents work from your own course material, and every card they make shows the slide it
                came from.
              </p>
            </div>
            <div className="vh-bigface" aria-hidden="true">
              <Mascot size={420} />
            </div>
          </Reveal>
        </section>

        <section className="vh-wrap">
          <Words as="h2" className="vh-h2 vh-center" text="Work with several agents at once" />
          <TypeOn className="sn-lead" text="Give each agent a piece of the course. They work side by side, and Nemesis checks everything they hand back." />
          <div className="vh-duo">
            <Reveal kind="rise" className="vh-card">
              <p className="vh-card-t">Claude drafts while you read</p>
              <p className="vh-card-s">Open the lecture and the deck builds beside it.</p>
              <div className="vh-card-art">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/photos/laptop-macro.webp" alt="" loading="lazy" />
                <div className="vh-card-win">
                  <DeckMock />
                </div>
              </div>
            </Reveal>
            <Reveal kind="rise" className="vh-card" style={{ transitionDelay: "90ms" }}>
              <p className="vh-card-t">Nemesis checks every card</p>
              <p className="vh-card-s">A card without a source goes back to the agent that wrote it.</p>
              <div className="vh-card-art">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/photos/study-guide.webp" alt="" loading="lazy" />
                <div className="vh-card-win vh-card-win-wide">
                  <SchemaMock />
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="vh-wrap vh-jobs">
          <div>
            <h2 className="vh-h2">Give each agent a job</h2>
            <p className="vh-text">A deck builder for lectures, a slide maker for seminars, a guide writer for readings, and a quiz for the night before.</p>
          </div>
          <AutoTabs tabs={JOBS} />
        </section>

        <section className="sn-band vh-film">
          <Words as="h2" className="sn-h2" text="One deck, start to finish" />
          <Reveal kind="rise" className="vh-film-frame">
            <div className="sn-frame" style={{ aspectRatio: "1860 / 1200" }}>
              <LoopVideo src="/showcase/together.mp4" poster="/showcase/together.webp" label="A student and Claude building a flashcard deck together in Nemesis" />
            </div>
          </Reveal>
        </section>

        <SnFaq items={FAQ} />

        <section className="vh-close">
          <Words as="h2" className="vh-h1" text="Meet your first agent" />
          <p className="vh-sub">It starts with one lecture.</p>
          <div className="sn-actions">
            <a className="sn-btn sn-btn-solid nm-press" href="/app">
              Start free
            </a>
            <a className="sn-btn sn-btn-ghost" href="/pricing">
              See pricing
            </a>
          </div>
          <div aria-hidden="true">
            <Reveal kind="draw" className="vh-outline">
              <svg viewBox="0 0 410 360">
                <path d={OUTLINE} pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.4" />
                <rect x="138" y="96" width="46" height="112" rx="23" pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.4" />
                <rect x="226" y="96" width="46" height="112" rx="23" pathLength={1} fill="none" stroke="currentColor" strokeWidth="1.4" />
              </svg>
            </Reveal>
          </div>
        </section>
      </main>
      <SnFoot />
    </div>
  );
}
