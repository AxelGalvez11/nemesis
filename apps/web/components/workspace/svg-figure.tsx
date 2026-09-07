"use client";

// A mechanism the model drew, rendered.
//
// Owner, 2026-09-07: *"go into wondering because our mermaid diagrams and visuals arent as good as
// theres one for one"*. Their mechanism diagrams are raw SVG on a fixed canvas
// (docs/canvas-workspace-reference.md §10), which is what this draws.
//
// 🔴🔴 THE MARKUP IS ALREADY CLEAN BY THE TIME IT GETS HERE, and this component must never be the
// place that decides so. `sanitizeSvgFigure` is a pure function with its own tests, run at the
// fence; if it returned null there is no component. `dangerouslySetInnerHTML` below is reading a
// value that has been through an allow-list of elements AND attributes — see lib/workspace/
// svg-figure.ts, and do not call this with anything that has not.
//
// 🔴🔴 THE INK IS `currentColor` AND THE FILLS ARE FIXED, WHICH IS HOW ONE DRAWING SUITS BOTH
// THEMES. Wondering's figures are a light palette on cream paper, and copying that literally would
// put a bright rectangle in the middle of a dark chat. Everywhere else in this product a drawing is
// themed by position (visual-figure.tsx cycles `--ui-kind-*` tints) — a mechanism cannot be, because
// its meaning is partly IN the colour: the blocker is a different colour from the flow, the outcome
// a different colour from its causes, and re-tinting by position would say the wrong thing.
//
// So the house style splits them. Outlines, arrows and labels are drawn in `currentColor`, which
// this card sets from the theme, so the ink is dark on paper and light on a dark ground. The FILLS
// are a fixed set of mid-tone accents chosen to read against either. No background rect: the card
// is the paper.
//
// 🔴 `aria-label` FROM THE FIGURE'S OWN <title>, and `role="img"` so a screen reader announces one
// thing rather than walking forty <text> nodes. A drawing with no title announces as a figure and
// nothing else, which is honest: it is better than reading out "RAAS Constricts vessels Retains".

import type { SvgFigure } from "@/lib/workspace/svg-figure";

export function SvgFigureBlock({ figure }: { figure: SvgFigure }) {
  return (
    <figure className="my-[16px] overflow-hidden rounded-[16px] border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) text-foreground" data-svg-figure="">
      {/* 🔴 THE SVG SCALES TO THE COLUMN AND KEEPS ITS SHAPE, which is what the required viewBox
          buys. `block` because an inline SVG sits on the text baseline and leaves a 4px gap under
          it that reads as a broken border. */}
      <div
        className="[&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        aria-label={figure.title || "Diagram"}
        dangerouslySetInnerHTML={{ __html: figure.svg }}
        role="img"
      />
      {figure.title && (
        <figcaption className="border-t border-(--ui-stroke-secondary) px-[16px] py-[10px] text-[13px] leading-[18px] text-(--ui-text-secondary)">
          {figure.title}
        </figcaption>
      )}
    </figure>
  );
}
