"use client";

import { useId } from "react";

import { MARK_OVALS, MARK_VIEW } from "@/components/NemesisMark";

import "../reference.css";
import "./brand.css";

/**
 * Brand exploration: the Nemesis mark and name, under the new design system.
 *
 * Owner, 2026-09-10: "make sure nemesis logo and name also follows font and design", and on being
 * asked, "explore new marks too".
 *
 * THE NAME. The shipped lockup sets "Nemesis" in Hanken Grotesk at 15px/500 with 5.1px of letter
 * spacing — a different family from everything else on the page, and wide tracking the system
 * forbids above 12px (tracking crosses zero at 12px and goes negative as type grows). Here it is set
 * in Inter, the system face, at the system's own tracking.
 *
 * THE MARKS. The current three-oval mark is shown exactly as shipped, next to three new ones. Every
 * mark is ONE flat colour (`currentColor`), because the rule in NemesisMark.tsx still holds: a mark
 * must survive 16px, one colour, and being embroidered. Where shapes overlap, the gap is cut with a
 * mask rather than drawn in a background colour, so the mark works on any ground.
 *
 * 🔴 THE CLASS PREFIX IS `bx-`, NOT `brand-`. The landing app's globals.css already owns `.brand` (the
 * old nav logo: a centred flex row, with `.brand b` set in Hanken Grotesk at 14px and 0.3em). The first
 * render inherited all of it: the page laid out as one centred row, the Inter wordmarks came out in
 * Hanken with wide tracking, and the name vanished on the dark cards. Found by listing the matched
 * rules, not by guessing.
 *
 * 🔴 NOT a circle with eyes. x.ai's bot mark is a black circle with two white eyes, and our
 * character is a close cousin; none of these marks gives a shape a face.
 */

type MarkProps = { size: number };

/** Current mark: three flat ovals on a diagonal, geometry imported from the shipped component. */
function CurrentMark({ size }: MarkProps) {
  return (
    <svg viewBox={MARK_VIEW.box} height={size} width={size * MARK_VIEW.ratio} aria-hidden="true">
      {MARK_OVALS.map((o) => (
        <g key={o.cy} transform={`rotate(${o.tilt} ${o.cx} ${o.cy})`}>
          <ellipse cx={o.cx} cy={o.cy} rx={o.rx} ry={o.ry} fill="currentColor" />
        </g>
      ))}
    </svg>
  );
}

/** A: Stack. Three cards on the same diagonal rhythm as the ovals, each cutting a clean gap out of
 *  the one behind it. Reads as a deck, and as deliverables piling up. */
function StackMark({ size }: MarkProps) {
  const id = useId().replace(/:/g, "");
  const cards = [
    { x: 8, y: 10 },
    { x: 26, y: 32 },
    { x: 44, y: 54 },
  ];
  const card = (c: { x: number; y: number }, extra?: React.SVGProps<SVGRectElement>) => (
    <rect x={c.x} y={c.y} width="48" height="34" rx="9" transform={`rotate(-12 ${c.x + 24} ${c.y + 17})`} {...extra} />
  );
  return (
    <svg viewBox="0 0 100 100" height={size} width={size} aria-hidden="true">
      <defs>
        {cards.slice(0, 2).map((c, i) => (
          <mask id={`${id}-m${i}`} key={i} maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120">
            <rect x="-10" y="-10" width="120" height="120" fill="white" />
            {card(cards[i + 1]!, { fill: "black", stroke: "black", strokeWidth: 9 })}
          </mask>
        ))}
      </defs>
      {cards.map((c, i) => (
        <g key={i} mask={i < 2 ? `url(#${id}-m${i})` : undefined}>
          {card(c, { fill: "currentColor" })}
        </g>
      ))}
    </svg>
  );
}

/** B: Interval. Three beads whose gaps grow, the way a spaced-repetition schedule does, rising as
 *  memory strengthens. Keeps the three-bead DNA of the current mark. */
function IntervalMark({ size }: MarkProps) {
  return (
    <svg viewBox="0 0 100 100" height={size} width={size} aria-hidden="true">
      <circle cx="16" cy="74" r="12" fill="currentColor" />
      <circle cx="40" cy="60" r="12" fill="currentColor" />
      <circle cx="80" cy="30" r="12" fill="currentColor" />
    </svg>
  );
}

/** C: Dock. The character's own squircle body (superellipse, n = 4.2) with a small bead docked at
 *  its corner behind a cut gap: something joining the workspace. No face. */
function DockMark({ size }: MarkProps) {
  const id = useId().replace(/:/g, "");
  const n = 4.2, cx = 44, cy = 58, a = 36;
  const pts: string[] = [];
  for (let i = 0; i <= 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const x = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = cy + a * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return (
    <svg viewBox="0 0 100 100" height={size} width={size} aria-hidden="true">
      <defs>
        <mask id={`${id}-cut`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect width="100" height="100" fill="white" />
          <circle cx="80" cy="22" r="19" fill="black" />
        </mask>
      </defs>
      <polygon points={pts.join(" ")} fill="currentColor" mask={`url(#${id}-cut)`} />
      <circle cx="80" cy="22" r="13" fill="currentColor" />
    </svg>
  );
}

const MARKS = [
  { key: "current", name: "Current", note: "Three flat ovals, exactly as shipped.", Mark: CurrentMark },
  { key: "stack", name: "A · Stack", note: "Three cards on the ovals' diagonal. A deck, and deliverables.", Mark: StackMark },
  { key: "interval", name: "B · Interval", note: "Three beads whose gaps grow like a review schedule.", Mark: IntervalMark },
  { key: "dock", name: "C · Dock", note: "The character's squircle with something docking to it.", Mark: DockMark },
] as const;

const WORDMARKS = [
  { name: "Current", cls: "bw-current", note: "Hanken Grotesk 15/500, +5.1px tracking" },
  { name: "Inter 500", cls: "bw-500", note: "Inter 20/500, −0.3px. The system's UI weight." },
  { name: "Inter 400", cls: "bw-400", note: "Inter 20/400, −0.3px. The display weight." },
  { name: "Inter 600", cls: "bw-600", note: "Inter 20/600, −0.4px. The system's ceiling." },
];

export default function BrandExploration() {
  return (
    <main className="ref-page bx">
      <header className="bx-head">
        <h1 className="ref-h2">The mark and the name</h1>
        <p className="ref-body ref-dim">
          The current mark next to three new ones, and the name reset in the system typeface. Every
          mark is one flat colour and has to hold up at 16 pixels.
        </p>
      </header>

      <section className="bx-sec">
        <h2 className="ref-mono bx-label">Marks</h2>
        <div className="bx-marks">
          {MARKS.map(({ key, name, note, Mark }) => (
            <article className="bx-card" key={key}>
              <div className="bx-stage">
                <Mark size={128} />
              </div>
              <div className="bx-sizes">
                {[64, 32, 24, 16].map((s) => (
                  <span key={s} className="bx-size">
                    <Mark size={s} />
                    <i>{s}</i>
                  </span>
                ))}
              </div>
              <div className="bx-dark">
                <Mark size={40} />
                <span className="bx-lockup">
                  <Mark size={22} />
                  <span className="bw-500">Nemesis</span>
                </span>
              </div>
              <p className="bx-name">{name}</p>
              <p className="ref-meta ref-dim">{note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bx-sec">
        <h2 className="ref-mono bx-label">Name</h2>
        <div className="bx-words">
          {WORDMARKS.map((w) => (
            <div className="bx-word-row" key={w.name}>
              <span className="bx-lockup bx-lockup-lg">
                <CurrentMark size={24} />
                <span className={w.cls}>Nemesis</span>
              </span>
              <span className="ref-meta ref-dim">
                {w.name} · {w.note}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
