"use client";

// DEV-ONLY PREVIEW — five designs for the player that appears while Nemesis is reading aloud.
//
// Owner, 2026-09-01: *"i dont like the audio player design, can you give me several designs"*.
// Nothing here ships; the page IS the proposal, the way /dev-preview/voice-glow was.
//
// WHAT IS ON SCREEN TODAY (candidate 0, drawn first for comparison): five bare glyphs in the
// canvas header, left of the Sources and map icons: play/pause, a speed label, back ten, forward
// ten, and a close. Its own file argues for having no card and no border, because it sits in the
// canvas chrome strip and a capsule would be the only boxed thing on a surface whose whole point
// is having no toolbar. That argument is why it looks the way it does, and it is the thing the
// owner is now rejecting.
//
// EVERY CANDIDATE OBEYS THREE RULES:
//   1. It lives in the same place: the 56px header strip, left of the icons, on --ui-bg-editor.
//      That position is the owner's own choice from 2026-08-25, shown both edges.
//   2. The colour it may add is --ui-action, the character's accent, and nothing else. One accent
//      in the product (the 2026-08-30 ruling).
//   3. It takes NO width when nothing is playing, so the canvas title keeps every pixel it has
//      today and the row never reflows mid-session.
//
// TWO CANDIDATES TOUCH AN EARLIER RULING, AND SAY SO ON THE PAGE: B and C draw PROGRESS. The
// scrubber was cut on 2026-08-23 and the clock on 2026-08-25 ("dont add the 'audio time'"), both
// while this row lived under every answer. Neither adds a number; both are a line that fills. The
// owner decides whether the old ruling still binds in the header.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

/**
 * A fake transport, so every candidate animates from one clock.
 *
 * 🔴 IT OPENS PART-WAY THROUGH, NOT AT ZERO, and that is about being LOOKED at rather than about
 * realism. Starting at 0 meant every screenshot of this page caught the progress candidates in
 * their first second, so B's line and C's ring both photographed as a two-pixel sliver and the
 * whole point of those two designs was invisible in the very artefact used to judge them.
 */
const OPENS_AT = 0.42;

function usePlayhead(seconds: number) {
  const [at, setAt] = useState(seconds * OPENS_AT);
  useEffect(() => {
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      setAt((seconds * OPENS_AT + (now - start) / 1000) % seconds);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seconds]);
  return { at, fraction: at / seconds };
}

/** Ten-second jump arrow, the current one, reused so the comparison is about layout not glyphs. */
function JumpIcon({ back, size = 20 }: { back: boolean; size?: number }) {
  return (
    <svg aria-hidden="true" fill="none" height={size} viewBox="0 0 20 20" width={size}>
      <g transform={back ? undefined : "translate(20 0) scale(-1 1)"}>
        <path d="M10 4.6a6.6 6.6 0 1 0 6.4 8.1" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
        <path d="M10 1.9 7.1 4.6 10 7.3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      </g>
      <text dominantBaseline="central" fill="currentColor" fontSize="6.4" fontWeight="600" textAnchor="middle" x="10" y="11.4">10</text>
    </svg>
  );
}

// ── 0. What ships today ────────────────────────────────────────────────────────────────────────

const BARE =
  "flex h-[36px] shrink-0 items-center justify-center rounded-[8px] px-2 text-(--ui-text-tertiary) "
  + "transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)";

function Today({ playing }: { playing: boolean }) {
  return (
    <div className="flex items-center gap-1">
      <button className={cn(BARE, "text-(--ui-text-secondary)")} type="button">
        <Codicon name={playing ? "debug-pause" : "play"} size="20px" />
      </button>
      <button className={cn(BARE, "text-[13px] font-medium tabular-nums")} type="button">1×</button>
      <button className={BARE} type="button"><JumpIcon back /></button>
      <button className={BARE} type="button"><JumpIcon back={false} /></button>
      <button className={BARE} type="button"><Codicon name="close" size="20px" /></button>
    </div>
  );
}

// ── A. Capsule ─────────────────────────────────────────────────────────────────────────────────
// The same five controls, gathered into one soft container so the row reads as ONE object rather
// than five loose glyphs that happen to sit together. Smallest possible change to what exists.

function CandidateA({ playing }: { playing: boolean }) {
  const button =
    "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[6px] text-(--ui-text-tertiary) "
    + "transition-colors hover:bg-(--ui-bg-secondary) hover:text-(--ui-text-primary)";
  return (
    <div className="flex h-[36px] items-center gap-[2px] rounded-[10px] bg-(--ui-bg-tertiary) px-[5px]">
      <button className={cn(button, "text-(--ui-text-primary)")} type="button">
        <Codicon name={playing ? "debug-pause" : "play"} size="17px" />
      </button>
      <button className={button} type="button"><JumpIcon back size={17} /></button>
      <button className={button} type="button"><JumpIcon back={false} size={17} /></button>
      <button className={cn(button, "w-auto px-[7px] text-[12px] font-medium tabular-nums")} type="button">1×</button>
      <span className="mx-[2px] h-[16px] w-px bg-(--ui-stroke-tertiary)" />
      <button className={button} type="button"><Codicon name="close" size="15px" /></button>
    </div>
  );
}

// ── B. Speaking line ───────────────────────────────────────────────────────────────────────────
// A pill whose whole left side IS the progress of the reading: an accent line that fills as it
// speaks. Play/pause on the left, speed and stop on the right, jumps on hover only. Draws
// progress (see the header note) but never a number.

function CandidateB({ playing }: { playing: boolean }) {
  const { fraction } = usePlayhead(24);
  return (
    <div className="group flex h-[36px] items-center gap-[8px] rounded-[999px] bg-(--ui-bg-tertiary) pl-[6px] pr-[8px]">
      <button
        className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-(--ui-action) text-(--ui-bg-editor) transition-transform hover:scale-105"
        type="button"
      >
        <Codicon name={playing ? "debug-pause" : "play"} size="14px" />
      </button>
      <div className="relative h-[3px] w-[86px] overflow-hidden rounded-full bg-(--ui-stroke-secondary)">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-(--ui-action)"
          style={{ width: `${(playing ? fraction : 0.42) * 100}%` }}
        />
      </div>
      <button className="hidden shrink-0 text-(--ui-text-tertiary) transition-colors hover:text-(--ui-text-primary) group-hover:block" type="button">
        <JumpIcon back size={16} />
      </button>
      <button className="shrink-0 text-[12px] font-medium tabular-nums text-(--ui-text-tertiary) transition-colors hover:text-(--ui-text-primary)" type="button">1×</button>
      <button className="shrink-0 text-(--ui-text-quaternary) transition-colors hover:text-(--ui-text-primary)" type="button">
        <Codicon name="close" size="15px" />
      </button>
    </div>
  );
}

// ── C. One orb ─────────────────────────────────────────────────────────────────────────────────
// The quietest possible player: a single round button that is play/pause, wrapped in a thin ring
// that fills as the audio plays. Everything else appears only when the pointer is on it. One
// glyph in the row when you are not touching it.

function CandidateC({ playing }: { playing: boolean }) {
  const { fraction } = usePlayhead(24);
  const shown = playing ? fraction : 0.42;
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="group flex h-[36px] items-center gap-[2px]">
      <button className="relative flex h-[36px] w-[36px] items-center justify-center" type="button">
        <svg className="absolute inset-0 -rotate-90" height="36" viewBox="0 0 36 36" width="36">
          <circle cx="18" cy="18" fill="none" r={radius} stroke="var(--ui-stroke-secondary)" strokeWidth="2" />
          <circle
            cx="18"
            cy="18"
            fill="none"
            r={radius}
            stroke="var(--ui-action)"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - shown)}
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
        <Codicon name={playing ? "debug-pause" : "play"} size="15px" />
      </button>
      <div className="flex items-center gap-[2px] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <button className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary)" type="button"><JumpIcon back size={16} /></button>
        <button className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary)" type="button"><JumpIcon back={false} size={16} /></button>
        <button className="flex h-[28px] items-center rounded-[6px] px-[6px] text-[12px] font-medium tabular-nums text-(--ui-text-tertiary) hover:bg-(--ui-bg-tertiary)" type="button">1×</button>
        <button className="flex h-[28px] w-[28px] items-center justify-center rounded-[6px] text-(--ui-text-quaternary) hover:bg-(--ui-bg-tertiary)" type="button"><Codicon name="close" size="15px" /></button>
      </div>
    </div>
  );
}

// ── D. It says what it is ──────────────────────────────────────────────────────────────────────
// A pill that speaks in words: live bars, the words "Reading aloud", then pause and stop. The
// only candidate a first-time learner can read without knowing what the glyphs mean.

function LiveBars({ playing }: { playing: boolean }) {
  const { at } = usePlayhead(24);
  const heights = [0, 1, 2, 3].map((index) => {
    if (!playing) return 4;
    const wave = Math.sin(at * 6 + index * 1.3);
    return 4 + Math.abs(wave) * 8;
  });
  return (
    <span className="flex h-[14px] w-[16px] items-center justify-between" aria-hidden>
      {heights.map((height, index) => (
        <span key={index} className="w-[2px] rounded-full bg-(--ui-action)" style={{ height: `${height}px` }} />
      ))}
    </span>
  );
}

function CandidateD({ playing }: { playing: boolean }) {
  return (
    <div className="flex h-[34px] items-center gap-[8px] rounded-[999px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-secondary) pl-[10px] pr-[6px]">
      <LiveBars playing={playing} />
      <span className="text-[12.5px] text-(--ui-text-secondary)">{playing ? "Reading aloud" : "Paused"}</span>
      <span className="h-[14px] w-px bg-(--ui-stroke-tertiary)" />
      <button className="flex h-[24px] w-[24px] items-center justify-center rounded-full text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)" type="button">
        <Codicon name={playing ? "debug-pause" : "play"} size="14px" />
      </button>
      <button className="flex h-[24px] items-center rounded-full px-[6px] text-[12px] font-medium tabular-nums text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)" type="button">1×</button>
      <button className="flex h-[24px] w-[24px] items-center justify-center rounded-full text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)" type="button">
        <Codicon name="close" size="14px" />
      </button>
    </div>
  );
}

// ── E. Tightened ───────────────────────────────────────────────────────────────────────────────
// No container at all, the objection in the current file's own header answered on its own terms:
// the five controls stay bare, but smaller, tighter, with the accent on the one control anybody
// actually presses and the rest stepped back a shade. The "just make it look better" option.

function CandidateE({ playing }: { playing: boolean }) {
  const button =
    "flex h-[30px] w-[26px] shrink-0 items-center justify-center rounded-[6px] text-(--ui-text-quaternary) "
    + "transition-colors hover:text-(--ui-text-primary)";
  return (
    <div className="flex h-[36px] items-center gap-[1px]">
      <button className="mr-[3px] flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-(--ui-action) transition-colors hover:bg-(--ui-bg-tertiary)" type="button">
        <Codicon name={playing ? "debug-pause" : "play"} size="18px" />
      </button>
      <button className={button} type="button"><JumpIcon back size={16} /></button>
      <button className={button} type="button"><JumpIcon back={false} size={16} /></button>
      <button className={cn(button, "w-auto px-[5px] text-[12px] font-medium tabular-nums")} type="button">1×</button>
      <button className={button} type="button"><Codicon name="close" size="15px" /></button>
    </div>
  );
}

// ── the page ───────────────────────────────────────────────────────────────────────────────────

/** One candidate, in the real header strip: the player, then the canvas title, then the icons. */
function HeaderRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[56px] items-center gap-[10px] rounded-[10px] border border-(--ui-stroke-tertiary) bg-(--ui-bg-editor) px-[14px]">
      {children}
      <span className="ml-[4px] flex-1 truncate text-[13px] text-(--ui-text-tertiary)">Enzymes and activation energy</span>
      <span className="flex items-center gap-1 text-(--ui-text-tertiary)">
        <span className="flex h-[36px] w-[36px] items-center justify-center"><Codicon name="library" size="20px" /></span>
        <span className="flex h-[36px] w-[36px] items-center justify-center"><Codicon name="list-tree" size="20px" /></span>
      </span>
    </div>
  );
}

interface Candidate {
  key: string;
  name: string;
  pitch: string;
  cost: string;
  render: (playing: boolean) => React.ReactNode;
}

const CANDIDATES: Candidate[] = [
  {
    cost: "This is the thing you said you do not like. Shown for comparison only.",
    key: "0",
    name: "On screen today",
    pitch: "Five bare glyphs in the header row.",
    render: (playing) => <Today playing={playing} />,
  },
  {
    cost: "Adds a container to a surface that deliberately has none. Nothing else changes.",
    key: "A",
    name: "A. Capsule",
    pitch: "The same five controls, gathered into one soft shape so they read as one thing instead of five loose icons.",
    render: (playing) => <CandidateA playing={playing} />,
  },
  {
    cost: "Draws progress. The scrubber was cut in August, though that was while this row sat under every answer, and this is a line rather than a number.",
    key: "B",
    name: "B. Speaking line",
    pitch: "You can see how far through the reading is. Accent play button, a line that fills, jumps appear on hover.",
    render: (playing) => <CandidateB playing={playing} />,
  },
  {
    cost: "Everything except play is behind a hover, so on a touch screen the rest needs a tap first.",
    key: "C",
    name: "C. One orb",
    pitch: "The quietest option: a single round button with a ring that fills. The other controls appear when you point at it.",
    render: (playing) => <CandidateC playing={playing} />,
  },
  {
    cost: "The widest of the five, and the only one with a border. It takes room from the canvas title.",
    key: "D",
    name: "D. It says what it is",
    pitch: "Moving bars and the words Reading aloud. The only one a first-time learner can read without guessing the glyphs.",
    render: (playing) => <CandidateD playing={playing} />,
  },
  {
    cost: "Keeps the no-container argument, so if the loose icons themselves are the problem this does not fix it.",
    key: "E",
    name: "E. Tightened",
    pitch: "No container: the same layout, smaller and closer, accent on the one button anybody presses, the rest stepped back.",
    render: (playing) => <CandidateE playing={playing} />,
  },
];

export default function VoiceAudioPlayerPreview() {
  const [playing, setPlaying] = useState(true);

  return (
    <main data-workspace className="min-h-screen bg-(--ui-bg) px-[56px] py-[44px] text-(--ui-text-primary)">
      <header className="mb-[8px] flex items-baseline gap-[16px]">
        <h1 className="text-[16px] font-semibold">Five designs for the read-aloud player</h1>
        <button
          className="rounded-[7px] bg-(--ui-bg-tertiary) px-[10px] py-[4px] text-[12px] text-(--ui-text-secondary)"
          onClick={() => setPlaying((was) => !was)}
          type="button"
        >
          {playing ? "showing: playing" : "showing: paused"}
        </button>
      </header>
      <p className="mb-[36px] max-w-[680px] text-[12.5px] leading-[1.6] text-(--ui-text-tertiary)">
        Each one sits where the player sits today: the canvas header, left of the icons. All five
        take no width at all when nothing is being read, so the title never moves. Colour is the
        character&apos;s accent and nothing else.
      </p>

      <div className="flex flex-col gap-[34px]">
        {CANDIDATES.map((candidate) => (
          <section key={candidate.key} data-candidate={candidate.key}>
            <div className="mb-[8px] flex items-baseline gap-[12px]">
              <h2 className="text-[13.5px] font-semibold">{candidate.name}</h2>
              <p className="text-[12.5px] text-(--ui-text-tertiary)">{candidate.pitch}</p>
            </div>
            <HeaderRow>{candidate.render(playing)}</HeaderRow>
            <p className="mt-[7px] text-[12px] text-(--ui-text-quaternary)">Cost: {candidate.cost}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
