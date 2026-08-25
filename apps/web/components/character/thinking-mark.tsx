// The small mark beside the thinking caption.
//
// 🔴 DRAWN, NOT IMPORTED. Six shapes do not justify an icon dependency, and a house mark can be
// tuned to the type it stands beside — same conclusion the deck work reached when a stock glyph
// dropped into a composed slide read as clip art every time.
//
// 🔴 WHICH mark is not decided here. `thinking-phases.ts` owns that, because whether a mark may
// be shown at all is the same honesty question as whether a caption may: it must name work that
// is genuinely running. This file only knows how to draw one.
//
// Everything is stroked in `currentColor` at one weight, so a mark inherits the caption's colour
// and its opacity transitions with it — including the fade-out when the answer starts arriving.

import type { ThinkingMark as Mark } from "@/lib/learn/thinking-phases";

/** Drawn on a 16-unit grid, stroked. `round` caps keep a 1.5px line from looking chipped at the
 *  size a caption sits at. */
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.5,
} as const;

function Glyph({ kind }: { kind: Mark }) {
  switch (kind) {
    case "reading":
      // A page: three lines, the last one short, the way a paragraph ends.
      return (
        <g {...STROKE}>
          <path d="M3.5 2.5h9v11h-9z" />
          <path d="M6 5.5h4M6 8h4M6 10.5h2.5" />
        </g>
      );
    case "mapping":
      // Three nodes and the edges between them — what mapping knowledge actually builds.
      return (
        <g {...STROKE}>
          <path d="M4.5 4.5 11.5 8M11.5 8 4.5 11.5" />
          <circle cx="4.5" cy="4.5" r="1.6" />
          <circle cx="11.5" cy="8" r="1.6" />
          <circle cx="4.5" cy="11.5" r="1.6" />
        </g>
      );
    case "finding":
      // A ring closing on a centre: looking for the one thing, not looking around.
      return (
        <g {...STROKE}>
          <circle cx="8" cy="8" r="5.2" />
          <circle cx="8" cy="8" r="1.4" />
        </g>
      );
    case "checking":
      // A tick, drawn open so it reads as "being checked" rather than "passed".
      return (
        <g {...STROKE}>
          <path d="M3 8.5 6.5 12 13 4" />
        </g>
      );
    case "searching":
      // A magnifier. The one place a conventional shape beats an invented one: everybody already
      // reads this as search, and a house mark here would be cleverness at the reader's expense.
      return (
        <g {...STROKE}>
          <circle cx="7" cy="7" r="4.2" />
          <path d="M10.2 10.2 13.5 13.5" />
        </g>
      );
    default:
      // Writing: a rule with a nib above it.
      return (
        <g {...STROKE}>
          <path d="M3 13h10" />
          <path d="M4.5 10.5 10.5 4.5l1.8 1.8L6.3 12.3z" />
        </g>
      );
  }
}

/**
 * One mark, sized to sit on a line of caption type.
 *
 * 🔴 ITS OWN COLOUR, NOT `currentColor` FROM THE CAPTION. The thinking caption animates a
 * gradient clipped to its glyphs, which works by painting the text itself transparent — so a
 * mark that inherited the caption's colour was drawn perfectly and painted in nothing. Measured
 * in the browser, not reasoned about: `getComputedStyle(svg).color` came back `rgba(0,0,0,0)`.
 *
 * 🔴 AND ITS OWN SIZE. The caption box is counter-scaled against the dock's transform, so `1em`
 * there is not the em anywhere else — it resolved to 6.7px. A fixed size is the only one that
 * means the same thing at both stations.
 *
 * `aria-hidden` because the caption beside it already says the same thing in words: a screen
 * reader announcing "image, magnifier, Searching the web" reads the fact twice.
 */
export function ThinkingMark({ kind }: { kind: Mark }) {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0 text-(--ui-text-tertiary)"
      fill="none"
      height="13"
      viewBox="0 0 16 16"
      width="13"
    >
      <Glyph kind={kind} />
    </svg>
  );
}
