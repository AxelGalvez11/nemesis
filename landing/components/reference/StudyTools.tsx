import type { CSSProperties, ReactNode } from "react";

import { CharacterMark } from "@/components/reference/agents";

/**
 * Study tools, in the shape of a Student Spaces workspace.
 *
 * Owner, 2026-09-10, of acrobat.adobe.com/studentspaces: "make sure we offer everything thats on here
 * on the landing page, dont worry about the real app", and of a space's chat view: "i love this
 * design, can we also make it look similar to this".
 *
 * WHAT IS BORROWED: the layout and its measured sizes (a grey ground, a 168px rail with a blue Create
 * pill, a white panel, 10px-radius tiles with a picture on the right, a 24px-radius composer). WHAT IS
 * OURS: every word, the marks, and the pictures, which are our own approved gradient art with a
 * drawn glyph on top. Nothing of Adobe's artwork, logo or copy is used.
 *
 * 🔴 NOT EVERY TOOL HERE IS BUILT. Flashcards, quizzes, study guides, slides, the course map and
 * lecture recordings exist in the app; mind maps, study packets, cheat sheets, practice exams,
 * podcasts, video summaries and shared spaces do not yet. The owner chose to show them all.
 */

type Art = "violet" | "emerald" | "lime" | "coral" | "azure" | "orange";

const INK: Record<Art, string> = { violet: "#6b45d8", emerald: "#128a5c", lime: "#7d9a1e", coral: "#d9463f", azure: "#1f6fae", orange: "#e0540c" };

export const TOOLS: { name: string; art: Art; glyph: GlyphKind }[] = [
  { name: "Flashcards", art: "violet", glyph: "flashcards" },
  { name: "Quiz", art: "emerald", glyph: "quiz" },
  { name: "Study guide", art: "lime", glyph: "guide" },
  { name: "Mind map", art: "coral", glyph: "mindmap" },
  { name: "Study packet", art: "azure", glyph: "packet" },
  { name: "Podcast", art: "orange", glyph: "podcast" },
  { name: "Video summary", art: "violet", glyph: "video" },
  { name: "Slides", art: "emerald", glyph: "slides" },
  { name: "Cheat sheet", art: "coral", glyph: "cheatsheet" },
  { name: "Course map", art: "azure", glyph: "coursemap" },
  { name: "Lecture notes", art: "lime", glyph: "lecture" },
  { name: "Practice exam", art: "orange", glyph: "exam" },
];

export const FEATURES: { art: Art; glyph: GlyphKind; lead: string; rest: string }[] = [
  { art: "azure", glyph: "files", lead: "Bring any file.", rest: "PDFs, Word, PowerPoint and Excel files, links, transcripts and photos of handwritten notes." },
  { art: "orange", glyph: "lecture", lead: "Lectures become notes.", rest: "Record a class or upload the audio. You get a transcript and clean notes." },
  { art: "violet", glyph: "chat", lead: "A tutor that shows its sources.", rest: "Ask about your material. Every answer links to the page it came from." },
  { art: "emerald", glyph: "podcast", lead: "Listen on the go.", rest: "Turn a reading or your notes into a two-voice podcast." },
  { art: "coral", glyph: "share", lead: "Study with classmates.", rest: "Share a space and choose who can view, comment or edit." },
  { art: "lime", glyph: "calendar", lead: "Ready before the exam.", rest: "Add the exam date, and Nemesis spaces your reviews before it." },
];

const PROMPTS = ["I have an exam on Friday", "I still don't get entropy", "Quiz me on Lecture 6", "I need to get through Chapter 4"];
const CHIPS = ["I have an exam coming up", "I'm stuck on a concept", "I have a long reading"];

type GlyphKind =
  | "flashcards" | "quiz" | "guide" | "mindmap" | "packet" | "podcast" | "video" | "slides" | "cheatsheet"
  | "coursemap" | "lecture" | "exam" | "files" | "chat" | "share" | "calendar";

/** A white drawing for a tool, on a 58x44 box, tinted with the darker end of its art. */
export function Glyph({ kind, ink }: { kind: GlyphKind; ink: string }) {
  const w = "#fff";
  const line = { stroke: ink, strokeWidth: 1.6, strokeLinecap: "round" as const, fill: "none" };
  const parts: Record<GlyphKind, ReactNode> = {
    flashcards: (
      <>
        <rect x="14" y="10" width="26" height="20" rx="4" fill={w} opacity="0.55" transform="rotate(-10 27 20)" />
        <rect x="20" y="14" width="26" height="20" rx="4" fill={w} />
        <path d="M30.6 20.3a2.6 2.6 0 1 1 3.4 2.5c-.6.2-.9.6-.9 1.2v.6" {...line} strokeWidth={1.8} />
        <circle cx="33.1" cy="27.6" r="1" fill={ink} />
      </>
    ),
    quiz: (
      <>
        <rect x="12" y="9" width="34" height="26" rx="4" fill={w} />
        <path d="M24 16h16M24 22h12M24 28h14" {...line} opacity="0.5" />
        <circle cx="18.5" cy="16.2" r="3.4" fill={ink} />
        <path d="m16.9 16.3 1.2 1.2 2.1-2.4" stroke={w} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      </>
    ),
    guide: (
      <>
        <path d="M29 12c-4-2.4-9-2.6-14-1.6v22c5-1 10-.8 14 1.6 4-2.4 9-2.6 14-1.6v-22c-5-1-10-.8-14 1.6Z" fill={w} />
        <path d="M18.5 16h7M18.5 20h7M18.5 24h5M32.5 16h7M32.5 20h7M32.5 24h5" {...line} opacity="0.45" />
      </>
    ),
    mindmap: (
      <>
        <path d="M29 22 15 13M29 22l14-9M29 22l-12 11M29 22l13 10" stroke={w} strokeWidth="1.6" opacity="0.9" />
        <circle cx="29" cy="22" r="6" fill={w} />
        <circle cx="15" cy="13" r="3.6" fill={w} />
        <circle cx="43" cy="13" r="3.6" fill={w} />
        <circle cx="17" cy="33" r="3.6" fill={w} />
        <circle cx="42" cy="32" r="3.6" fill={w} />
      </>
    ),
    packet: (
      <>
        <rect x="21" y="6" width="22" height="28" rx="3" fill={w} opacity="0.5" />
        <rect x="18" y="9" width="22" height="28" rx="3" fill={w} opacity="0.75" />
        <rect x="15" y="12" width="22" height="28" rx="3" fill={w} />
        <path d="M19 18h14M19 22h14M19 26h9" {...line} opacity="0.5" />
      </>
    ),
    podcast: (
      <>
        <rect x="9" y="13" width="40" height="18" rx="9" fill={w} />
        <path d="m16 18.5 5 3.5-5 3.5Z" fill={ink} />
        <path d="M26 19v6M29.5 16.5v11M33 18v8M36.5 15.5v13M40 19v6M43.5 20.5v3" {...line} strokeWidth={1.7} opacity="0.7" />
      </>
    ),
    video: (
      <>
        <rect x="10" y="9" width="38" height="26" rx="4" fill={w} />
        <circle cx="29" cy="22" r="7" fill={ink} />
        <path d="m27 18.8 5.2 3.2-5.2 3.2Z" fill={w} />
      </>
    ),
    slides: (
      <>
        <rect x="9" y="9" width="40" height="26" rx="3" fill={w} />
        <rect x="14" y="14" width="16" height="3" rx="1.5" fill={ink} />
        <rect x="14" y="20" width="11" height="2" rx="1" fill={ink} opacity="0.35" />
        <rect x="34" y="23" width="3.5" height="8" rx="1" fill={ink} opacity="0.55" />
        <rect x="39" y="19" width="3.5" height="12" rx="1" fill={ink} />
        <rect x="44" y="26" width="3" height="5" rx="1" fill={ink} opacity="0.35" />
      </>
    ),
    cheatsheet: (
      <>
        <rect x="15" y="6" width="28" height="34" rx="3" fill={w} />
        <path d="M19 12h12M19 17h20M19 22h20M19 27h20M19 32h14" {...line} opacity="0.45" />
      </>
    ),
    coursemap: (
      <>
        <path d="M12 33 22 25l10 3 12-14" stroke={w} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="33" r="3.4" fill={w} />
        <circle cx="22" cy="25" r="3.4" fill={w} />
        <circle cx="32" cy="28" r="3.4" fill={w} />
        <path d="M44 14V6l7 3-7 3" fill={w} stroke={w} strokeWidth="1.2" strokeLinejoin="round" />
      </>
    ),
    lecture: (
      <>
        <rect x="11" y="9" width="10" height="17" rx="5" fill={w} />
        <path d="M8.5 21a7.5 7.5 0 0 0 15 0M16 29v5" stroke={w} strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <rect x="27" y="10" width="21" height="25" rx="3" fill={w} />
        <path d="M31 16h13M31 21h13M31 26h9" {...line} opacity="0.5" />
      </>
    ),
    exam: (
      <>
        <rect x="12" y="7" width="26" height="31" rx="3" fill={w} />
        <path d="M16 14h14M16 19h18M16 24h12" {...line} opacity="0.45" />
        <circle cx="40" cy="30" r="8.5" fill={w} />
        <path d="M40 25.5V30l3 1.8" {...line} strokeWidth={1.8} />
      </>
    ),
    files: (
      <>
        <rect x="16" y="8" width="20" height="26" rx="3" fill={w} opacity="0.55" transform="rotate(-8 26 21)" />
        <rect x="21" y="11" width="20" height="26" rx="3" fill={w} />
        <path d="M25 18h12M25 23h12M25 28h8" {...line} opacity="0.5" />
      </>
    ),
    chat: (
      <>
        <path d="M11 13a4 4 0 0 1 4-4h24a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H24l-7 6v-6h-2a4 4 0 0 1-4-4Z" fill={w} />
        <path d="M17 16h20M17 22h12" {...line} opacity="0.5" />
        <rect x="31" y="20" width="7" height="5" rx="2.5" fill={ink} />
      </>
    ),
    share: (
      <>
        <circle cx="23" cy="16" r="6" fill={w} />
        <path d="M12 36c1-7 5.5-10.5 11-10.5S33 29 34 36Z" fill={w} />
        <circle cx="37" cy="17" r="4.6" fill={w} opacity="0.7" />
        <path d="M35 25.6c4.8.3 8.3 3.6 9 10.4h-7.5" fill={w} opacity="0.7" />
      </>
    ),
    calendar: (
      <>
        <rect x="14" y="10" width="30" height="27" rx="4" fill={w} />
        <path d="M14 17h30" {...line} opacity="0.35" />
        <path d="M21 7v6M37 7v6" stroke={w} strokeWidth="2" strokeLinecap="round" />
        <path d="m23.5 26 3.5 3.5 7-7.5" {...line} strokeWidth={2.2} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 58 44" aria-hidden="true" focusable="false">
      {parts[kind]}
    </svg>
  );
}

function Thumb({ art, glyph, className }: { art: Art; glyph: GlyphKind; className: string }) {
  return (
    <span className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/gradients/${art}.webp`} alt="" loading="lazy" decoding="async" />
      <Glyph kind={glyph} ink={INK[art]} />
    </span>
  );
}

// The mark in the mocked space's header: the three dots, same numbers as components/NemesisMark.tsx.
const Dots = () => (
  <svg viewBox="9.6 13.6 80.8 80.8" aria-hidden="true">
    <g fill="currentColor">
      {[[24.02, 35], [75.98, 35], [50, 80]].map(([cx, cy]) => (
        <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={10.8} />
      ))}
    </g>
  </svg>
);

const NAV: { name: string; d: string; on?: boolean }[] = [
  { name: "Overview", d: "M2.5 5.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2ZM2.5 8h15M8 8v8.5" },
  { name: "Sources", d: "M5 2.5h6.5l3.5 3.5v11H4.5v-14.5ZM11.5 2.5V6H15M7.5 10.5h5M7.5 13.5h3.5" },
  { name: "Study tools", d: "M3 2.5h5v15H3ZM11 2.5h6v7h-6ZM11 12h6v5.5h-6Z", on: true },
  { name: "Notes", d: "M4 3h12v14H4ZM7 7h6M7 10h6M7 13h4" },
  { name: "Chat", d: "M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v6a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3A2.5 2.5 0 0 1 3 11.5ZM7 7.5h6M7 10.5h4" },
];

/** The workspace itself: grey ground, rail, a white panel of tools, and a composer that suggests what to ask. */
export function SpaceMock() {
  return (
    <div className="ss" aria-hidden="true">
      <div className="ss-top">
        <span className="ss-logo">
          <Dots />
          Nemesis
        </span>
        <span className="ss-vr" />
        <span className="ss-space">
          Thermodynamics
          <svg viewBox="0 0 16 16" className="ss-i">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </span>
        <span className="ss-right">
          <span className="ss-stack">
            <span className="ss-av" style={{ background: "#8A63F0" }}>C</span>
            <span className="ss-av" style={{ background: "#2A8CCD" }}>G</span>
            <span className="ss-av ss-me">
              <CharacterMark size={15} />
            </span>
          </span>
          <span className="ss-pill ss-dark">Share</span>
          <span className="ss-pill ss-line">New space</span>
        </span>
      </div>
      <div className="ss-rail">
        <span className="ss-create">
          <svg viewBox="0 0 16 16" className="ss-i">
            <path d="M8 3.5v9M3.5 8h9" />
          </svg>
          Create
        </span>
        <div className="ss-nav">
          {NAV.map((n) => (
            <span key={n.name} className={n.on ? "on" : undefined}>
              <svg viewBox="0 0 20 20" className="ss-i">
                <path d={n.d} />
              </svg>
              {n.name}
            </span>
          ))}
        </div>
      </div>
      <div className="ss-panel">
        <div className="ss-col">
          <p className="ss-hello">
            <b>Welcome to your Thermodynamics space.</b>
            <br />
            Three lectures, two readings and your notes, ready to study.
          </p>
          <p className="ss-ask">Here&apos;s what Nemesis can make from your sources:</p>
          <div className="ss-tiles">
            {TOOLS.map((t, i) => (
              <div key={t.name} className="ss-tile" style={{ "--i": i } as CSSProperties}>
                <b>{t.name}</b>
                <Thumb art={t.art} glyph={t.glyph} className="ss-thumb" />
              </div>
            ))}
          </div>
        </div>
        <div className="ss-chips">
          {CHIPS.map((c) => (
            <span key={c} className="ss-chip">
              <svg viewBox="0 0 16 16" className="ss-i">
                <path d="M12.5 4v4.5a2 2 0 0 1-2 2h-7M6 8 3.5 10.5 6 13" />
              </svg>
              {c}
            </span>
          ))}
        </div>
        <div className="ss-composer">
          <div className="ss-box">
            <span className="ss-ph">
              {PROMPTS.map((p, i) => (
                <span key={p} style={{ "--i": i } as CSSProperties}>
                  {p}
                </span>
              ))}
            </span>
            <span className="ss-plus">+</span>
            <span className="ss-send">
              <svg viewBox="0 0 16 16" className="ss-i">
                <path d="M8 12.5V4M4.5 7.5 8 4l3.5 3.5" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Six things a space does beyond the tools, each with its own small piece of art. */
export function FeatureIcon({ art, glyph }: { art: Art; glyph: GlyphKind }) {
  return <Thumb art={art} glyph={glyph} className="sn-feat-ic" />;
}
