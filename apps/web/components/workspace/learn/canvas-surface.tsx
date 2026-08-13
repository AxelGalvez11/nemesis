"use client";

// The sheet every canvas state paints on, and the one control that is always on it.
//
// 🔴 THIS COMPONENT EXISTS FOR ONE REASON: THE EXIT MUST NOT BE OPTIONAL (UX brief §38.2).
//
// §38.1 takes the navigation rail off screen while a canvas is open, which makes the `×` the ONLY
// way out of a canvas. An entry path that renders no `×` is therefore not a cosmetic gap — it is a
// sealed room, and this repo has already shipped one: `learn/page.tsx` records that `/learn` used
// to be an immersive route, that suppressing the rail also suppressed its reopen toggle, and that
// the Canvas consequently offered no way to reach Library, Calendar or Stats at all.
//
// The previous arrangement put the exit inside `CanvasHeader`, which only one of the two render
// branches in `learning-canvas.tsx` used — so the processing state ("resolving this canvas's
// knowledge") painted a centred caption on an empty page with no exit on it. That was survivable
// only because the rail's toggle was still there. Under §38.1 it is the dead end returning.
//
// So the exit is hoisted ABOVE the branch. Every canvas state is a child of this component, the
// `×` is a sibling of `{children}` rather than something a branch remembers to include, and there
// is no `&&`, no ternary and no prop that can take it away. `canvas-shell.test.ts` asserts exactly
// that shape, because a boolean saying "this surface owns its exit" that nothing checks against the
// control is a value computed and never used.
//
// 🔴 NOT A HEADER BAR — the note that used to live in canvas-header.tsx moves here with the
// element. It is a transparent layer of controls floating ON the canvas: no container, no
// background of its own, no border-bottom, no shadow beneath it, no backdrop-filter. The whole
// surface is one uninterrupted sheet from the top of the viewport to the composer. The regression
// this replaced was measurable: a full-width `border-b` painted a 1px line across every one of the
// viewport's pixels at y≈54, which is what makes a workspace read as "an app page with a header"
// instead of a document. The layer is also deliberately `pointer-events-none` with only its
// children re-enabled, so the invisible strip cannot swallow clicks on the content underneath it.

import type * as React from "react";

/** The reading measure every part of the canvas is set to — document, question, diagnosis and
 *  composer — so the page reads as one column rather than four things that happen to be centred. */
const CANVAS_COLUMN_PX = "680px";

interface CanvasSurfaceProps {
  /** Leaves the canvas. Always wired; there is no state in which this control is absent. */
  onExit: () => void;
  /** The rest of the floating control strip — title, sources, objectives. Optional because a
   *  canvas that has not loaded yet has nothing to title, and 🔴 that is precisely the state that
   *  used to render no exit either. */
  chrome?: React.ReactNode;
  children: React.ReactNode;
}

export function CanvasSurface({ chrome, children, onExit }: CanvasSurfaceProps) {
  return (
    <main
      className="relative h-full min-h-0 bg-(--ui-bg-editor)"
      style={{ ["--canvas-column" as string]: CANVAS_COLUMN_PX }}
    >
      {/* A scrim, NOT a header. Without it, scrolled paragraphs print straight through the
          floating title and neither is readable. It is the page's own colour fading to nothing
          over 88px — the same device the composer already uses at the bottom — so it draws no
          line, no rectangle and no edge: there is no row where the colour steps. The acceptance
          check measures exactly that (the largest colour change between adjacent rows), because
          "is there a divider" is a question about steps, not about whether anything is painted. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[88px] bg-gradient-to-b from-(--ui-bg-editor) via-(--ui-bg-editor)/90 to-transparent" />

      {/* 🔴 32px TALL, 12px FROM THE EDGE -- DOWN FROM 36/16 (compact-UI pass, design judgement,
          owner spec 2026-08-12). Quieted alongside the composer and the two controls it carries;
          not measured against anything external, this row has no ChatGPT equivalent to match.
          🔴 THE LEFT EDGE IS NOT A CONSTANT. When the nav rail is collapsed the shell floats a
          reopen toggle at the viewport's top-left, in exactly this corner, and the two printed on
          top of each other. `--nav-toggle-inset` is what the shell reserves for it — 0px whenever
          the toggle is not showing, which under §38.1 is every canvas — so the strip returns to a
          flush 12px on its own rather than carrying a permanent gap for a control that is gone. */}
      <header
        className="pointer-events-none absolute right-[12px] top-[12px] z-30 flex h-[32px] items-center gap-1.5"
        style={{ left: "calc(12px + var(--nav-toggle-inset, 0px))" }}
      >
        <CanvasExit onExit={onExit} />
        {chrome}
      </header>

      {children}
    </main>
  );
}

/**
 * The `×`. §38.2: *"When inside a canvas the 'back button' should be an `×`."*
 *
 * 🔴 AN INLINE SVG, NOT THE ICON FONT THE REST OF THIS SURFACE USES. Every other glyph here is a
 * `Codicon`, which is a `<i class="codicon codicon-…">` styled by a webfont: if that font fails to
 * load the element still exists, still measures, still takes clicks — and draws nothing. For an
 * ordinary decorative glyph that is a cosmetic risk. For the only way out of a canvas it is the
 * dead end again, arriving through the asset pipeline instead of through a branch. An SVG cannot
 * fail to paint once the markup is on the page.
 *
 * 🔴 `aria-label` IS UNCHANGED — "Leave the canvas". The glyph changed, the control did not, and
 * other lanes probe this surface by that exact string.
 */
function CanvasExit({ onExit }: { onExit: () => void }) {
  return (
    <button
      aria-label="Leave the canvas"
      className="pointer-events-auto flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-lg text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
      onClick={onExit}
      title="Leave the canvas"
      type="button"
    >
      {/* 14px, matching the 0.875rem the arrow rendered at (0.875 × 18px root = 15.75px painted;
          the codicon glyph occupied 14px of it). Written in px because every rem in apps/web is
          1.125× its number — `html{font-size:112.5%}` is deliberate and set three times. */}
      <svg
        aria-hidden="true"
        fill="none"
        height="14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
        viewBox="0 0 16 16"
        width="14"
      >
        <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" />
      </svg>
    </button>
  );
}
