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
      // 🔴🔴 A GLOBE, NOT A MAGNIFIER — owner, 2026-08-25, with the caption on screen. The note that
      // stood here argued for the magnifier because "everybody already reads this as search", which
      // was right while the web was the ONLY thing this canvas could search. It no longer is: the
      // same turn can now read the learner's calendar and their connected apps, and a magnifier
      // beside "Searching the web" says the generic half of a sentence whose specific half is the
      // point. A globe says which of the three is running, at a glance, which is the whole job of a
      // mark sitting next to words that already say it.
      return (
        <g {...STROKE}>
          <circle cx="8" cy="8" r="5.4" />
          <path d="M2.6 8h10.8" />
          {/* The meridians. Two arcs of the same ellipse, mirrored, so the sphere reads as a
              sphere at 13px rather than as a circle with a line through it. */}
          <path d="M8 2.6a8 8 0 0 1 0 10.8M8 2.6a8 8 0 0 0 0 10.8" />
        </g>
      );
    case "calendar":
      // A month: the block, the two hangers, and the head rule that makes it a calendar rather
      // than a window. No dots inside — at 13px a grid of dots fills in and reads as noise.
      return (
        <g {...STROKE}>
          <path d="M2.8 4.2h10.4v9.2H2.8z" />
          <path d="M2.8 7h10.4" />
          <path d="M5.6 2.6v2.6M10.4 2.6v2.6" />
        </g>
      );
    case "apps":
      // 🔴 A CHAIN LINK, AND IT BEAT TWO BETTER-SOUNDING IDEAS AT 13px. The grid of squares is the
      // universal "apps" glyph and it means a LAUNCHER — a place to pick one — which is not what is
      // happening; Nemesis is reaching into an app the learner already connected, so connection is
      // what the shape has to say. A plug says that too and was drawn first, but three shapes
      // stacked in 13 pixels merge into a blob (rendered side by side and compared, 2026-08-25);
      // two overlapping panes lose against the `reading` page at the same size. The link is two
      // strokes on a diagonal, which is the one silhouette in this set nothing else owns.
      //
      // 🔴 THE USUAL OBJECTION IS THAT A LINK MEANS A URL, and it is answered by what this sits
      // next to: the web has a globe two cases up, and the caption always names the app out loud.
      return (
        <g {...STROKE}>
          <path d="M6.6 9.4 9.4 6.6" />
          <path d="M7 4.6 8.2 3.4a2.7 2.7 0 0 1 3.8 3.8l-1.2 1.2" />
          <path d="M9 11.4l-1.2 1.2a2.7 2.7 0 0 1-3.8-3.8l1.2-1.2" />
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
      // 🔴 18, WAS 13, AND `secondary` RATHER THAN `tertiary` (owner 2026-08-26: *"the icons
      // beside the [thinking] preview don't even look like they're part of the thinking preview.
      // and they look a bit small"*). Both halves of that are one cause: at 13px against a 14px
      // caption it read as a stray pip rather than the sentence's own mark, and tertiary ink put it
      // a full step behind the words it belongs to. Sized to the caption it now sits on (16px) and
      // inked to sit in the same line, it reads as punctuation rather than as a separate object.
      className="shrink-0 text-(--ui-text-secondary)"
      fill="none"
      height="18"
      viewBox="0 0 16 16"
      width="18"
    >
      <Glyph kind={kind} />
    </svg>
  );
}
