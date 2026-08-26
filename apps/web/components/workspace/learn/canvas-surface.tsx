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
import { useState } from "react";

import { useDeclareImmersiveSurface } from "@/components/workspace/shell/immersive-surface";
import { useSidePanelInset } from "@/components/workspace/shell/side-panel";

import { FileDropOverlay } from "./file-drop-overlay";

/** The reading measure every part of the canvas is set to — document, question, diagnosis and
 *  composer — so the page reads as one column rather than four things that happen to be centred.
 *
 * 🔴🔴 822, WAS 680, AND THE NUMBER THAT MATTERS IS THE 768 INSIDE IT. Owner 2026-08-26: *"the
 * learning doesnt match to how chatgpt does it."* Measured side by side, same request, same
 * 1470px viewport:
 *
 *              reference   Nemesis (before)
 *   text       768px       626px
 *   composer   768px       768px
 *   table      925px       686px, inside a 624px box
 *
 * So the lesson was being read at 626 while the composer under it was 768: the two halves of one
 * column, 142px apart. The reference sets its prose to exactly the width of its composer, which is
 * the number `--composer-max-width` in globals.css has held since it was measured.
 *
 * 🔴 THIS CONSTANT IS THE OUTSIDE OF THE BOX, NOT THE TEXT. Every part of the canvas wears
 * `max-w-(--canvas-column) px-6`, and `px-6` is 1.5rem against this app's 112.5% root, so 27px a
 * side: 822 - 54 = 768 of text. Change the padding and this number has to move with it.
 *
 * 🔴 AND IT IS WHAT MADE THE TABLES FIT. A five-column comparison table wanted 686px and had 624,
 * so every cell wrapped onto four or five lines and the last column was cut off mid-word. It is
 * the same table at 768. The reference goes further and lets a wide table break OUT of its prose
 * column to 925; that is not done here, and a table wider than 768 still scrolls inside itself. */
const CANVAS_COLUMN_PX = "822px";

interface CanvasSurfaceProps {
  /** Leaves the canvas. Always wired; there is no state in which this control is absent. */
  onExit: () => void;
  /** The rest of the floating control strip — title, sources, objectives. Optional because a
   *  canvas that has not loaded yet has nothing to title, and 🔴 that is precisely the state that
   *  used to render no exit either. */
  chrome?: React.ReactNode;
  children: React.ReactNode;
  /** Files dropped anywhere on the canvas. Absent while the session is still loading, because
   *  there is nothing yet to attach them to. */
  onDropFiles?: (files: FileList) => void;
}

export function CanvasSurface({ chrome, children, onDropFiles, onExit }: CanvasSurfaceProps) {
  // §38.1 — "Side bar should also not be visible when inside canvas." The whole rail, not the
  // toggle. This is what makes the exit below load-bearing rather than decorative, which is why
  // the two live in the same component: you cannot take the claim without taking the `×` with it.
  useDeclareImmersiveSurface();
  // 🔴 THE CANVAS ACCEPTED DROPS AND SHOWED NOTHING, which is a worse bug than refusing them. The
  // handlers below landed on 2026-08-20 and were correct; the surface simply never said it was a
  // target, so a learner holding a PDF over a canvas saw a page that looked inert and had no way
  // to know the drop would work until they let go. The front door has drawn a highlight since it
  // was built. This is that half arriving.
  const [draggingOver, setDraggingOver] = useState(false);
  // 🔴🔴 THE SURFACE IS PUSHED BY THE DOCKED READER, WHICH IS THE REFERENCE'S OWN BEHAVIOUR. Measured
  // in the owner's browser: the chat column's right edge sits at 474 and the panel begins at 490, so
  // the conversation genuinely reflows into what is left. A panel that floats over the thread hides
  // the half you are checking the artifact against, which is the half you opened it to compare.
  //
  // 🔴🔴 WIDTH, NOT PADDING, AND THE DIFFERENCE IS THE COMPOSER. Padding was the obvious choice and
  // it moved the document and left the composer sitting under the panel. An absolutely positioned
  // child — and the composer's layer is `absolute inset-x-0 bottom-0` — is laid out against its
  // containing block's PADDING BOX, which includes the padding. So `inset-x-0` spanned the full
  // width no matter how much padding this element carried. Narrowing the element itself moves
  // everything inside it, in flow or not.
  //
  // Seen on screen, not reasoned about: the document reflowed and the composer did not.
  const inset = useSidePanelInset();

  return (
    <main
      className="relative h-full min-h-0 bg-(--ui-bg-editor)"
      // 🔴🔴 DROPPING A FILE ON THE CANVAS DID NOTHING AT ALL UNTIL NOW. Owner, 2026-08-20: *"the
      // composer doesnt allow me to drop in multiple attachments before sending."* The FRONT DOOR
      // has had a drop handler since it was built (`canvas-home.tsx`); the canvas never did, so the
      // browser took the drop, navigated away from the session, and opened the PDF in the tab.
      //
      // 🔴 ON THE SURFACE, NOT ON THE COMPOSER. A drop target the size of a 52px pill is a target
      // you have to aim at, and nobody aims at a text box — they drop the file on the page. The
      // whole canvas accepts it, which is also what the front door does.
      //
      // 🔴 `preventDefault` ON DRAGOVER IS THE LOAD-BEARING HALF. Without it the drop event never
      // fires at all: the browser's default is to navigate, and it wins unless the dragover is
      // cancelled first. That is why both handlers are here rather than only the one that acts.
      // 🔴 GUARDED BY `currentTarget`, the same rule the front door already carries. Dragging
      // across a child fires dragleave on the parent, so an unguarded handler strobes the overlay
      // off and on for the whole traversal of a page this dense.
      onDragLeave={
        onDropFiles
          ? (event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDraggingOver(false);
            }
          : undefined
      }
      onDragOver={
        onDropFiles
          ? (event) => {
              // 🔴 ONLY A FILE DRAG RAISES IT. The canvas is `data-selectable-text`, so dragging a
              // highlighted sentence across it is an ordinary thing to do here — and offering to
              // ingest the learner's own selection is both wrong and alarming.
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              setDraggingOver(true);
            }
          : undefined
      }
      onDrop={
        onDropFiles
          ? (event) => {
              if (!event.dataTransfer?.files?.length) return;
              event.preventDefault();
              setDraggingOver(false);
              onDropFiles(event.dataTransfer.files);
            }
          : undefined
      }
      // 🔴🔴 SELECTION ON, EVERYWHERE ON THE CANVAS — owner call, 2026-08-19: "selection on
      // everywhere". `[data-workspace]` sets `user-select: none` for the whole app and individual
      // components opted back in one at a time, so whether you could highlight a sentence depended
      // on which screen you happened to be reading. That is worse than either answer: a learner
      // cannot tell a deliberate restriction from a broken page.
      //
      // 🔴 REUSING THE EXISTING OPT-IN RATHER THAN WRITING A NEW RULE. `desktop-chrome.css` already
      // has `[data-selectable-text='true'] *` at the specificity needed to beat the workspace
      // default, and it is where anyone looking for "why can I select here" will look. A second
      // mechanism spelled differently would be a second answer to one question.
      //
      // 🔴 SCOPED TO THE CANVAS, NOT LIFTED GLOBALLY. Turning selection on at `[data-workspace]`
      // would reach every other surface in the app, none of which was asked about.
      data-selectable-text="true"
      // The transition is what makes the push read as the panel arriving rather than the page jumping.
      style={{
        ["--canvas-column" as string]: CANVAS_COLUMN_PX,
        // The transition is what makes the push read as the panel arriving rather than the page jumping.
        transition: "width 200ms ease-out",
        width: inset ? `calc(100% - ${inset}px)` : undefined,
      }}
    >
      {/* A masthead the page scrolls under, NOT a fade over it — owner call, 2026-08-19.
          🔴🔴 THE GRADIENT WAS FADING THE LETTERS, NOT THE BACKGROUND, AND ONLY DARK MODE SHOWED IT.
          It stood 88px tall while the scroll container rests at `pt-[64px]`, so the top ~24px of
          whatever was on screen sat under a ramp that is ~90% opaque at its midpoint. Over a light
          page that is white-on-white and invisible; over a dark one the ramp is black and the
          learner's white text dissolved into it. The reported symptom was exactly that — "the
          letters have a fade on top" — and it was reproducible on any screen whose first line sits
          at the top of the column, which for a retrieval is the question itself.

          🔴 SOLID, AND SHORTER THAN THE CONTENT'S RESTING OFFSET. 56px clears the 12px/32px control
          row with room to spare and still stops 8px short of `pt-[64px]`, so at rest it covers
          nothing at all and there is no row where a letter is half-painted. It draws no visible
          edge for the same reason the gradient claimed to: it is the page's own colour. What it
          gives up is the soft hand-off — scrolled text now ends at a hard line instead of thinning
          out — which is what the reference does too, and is the price of text that is never
          half-erased. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-[56px] bg-(--ui-bg-editor)" />

      {draggingOver && <FileDropOverlay note="Drop any file here to add it to this canvas" />}

      {/* 🔴🔴 36px TALL — BACK UP FROM 32, AND THE SENTENCE THAT USED TO END THIS NOTE IS WHY. It
          read: "not measured against anything external, this row has no ChatGPT equivalent to
          match." It has one, it was measured in the owner's own browser on 2026-08-20 (36×36
          buttons, 20×20 glyphs, radius 8px), and he asked for this row to match it. A judgement made
          in the absence of a reference is the kind a reference should overturn.
          🔴 THE GAP TIGHTENS FROM 6px TO 4px AS THE BOXES GROW, so the row's overall width barely
          moves and the controls still read as one group rather than four separate marks.
          🔴 THE LEFT EDGE IS NOT A CONSTANT. When the nav rail is collapsed the shell floats a
          reopen toggle at the viewport's top-left, in exactly this corner, and the two printed on
          top of each other. `--nav-toggle-inset` is what the shell reserves for it — 0px whenever
          the toggle is not showing, which under §38.1 is every canvas — so the strip returns to a
          flush 12px on its own rather than carrying a permanent gap for a control that is gone. */}
      {/* 🔴🔴 THE CONTROLS FADE IN, AND UNTIL NOW NOTHING ON THIS SIDE MOVED AT ALL. Owner,
          2026-08-20: *"the transition from landing page to canvas needs to be smoother ... the
          upper header controls need to appear as a fade in."*

          The FRONT DOOR half of that transition was already built — the composer travels down and
          the greeting fades — and then the route changed and the canvas simply WAS there, header
          and all, hard-cut. Half a transition reads worse than none: the eye is following a moving
          composer and the destination arrives fully formed around it.

          🔴 A CSS ANIMATION RATHER THAN A MOUNT FLAG. A `useState(false)` flipped in an effect
          needs a paint to land before it can transition, which is the shape that produces a visible
          flash of the finished state on a slow client. `animation` runs from the first frame the
          element exists.

          🔴 AND IT IS BEHIND `prefers-reduced-motion`, because the front door's own travel already
          is — someone who asked the system to stop moving must not get half of it anyway. */}
      <header
        className="canvas-chrome-in pointer-events-none absolute right-[12px] top-[12px] z-30 flex h-[36px] items-center gap-1"
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
      className="pointer-events-auto flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[8px] text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
      onClick={onExit}
      title="Leave the canvas"
      type="button"
    >
      {/* 🔴 20px, MEASURED OFF CHATGPT (2026-08-20): its header glyphs are 20×20 inside a 36×36
          button, and every one of ours was 14–15px inside 28×28. Written in px because every rem in
          apps/web is 1.125× its number — `html{font-size:112.5%}` is deliberate and set three times.
          🔴 THE STROKE THINS TO 1.75 AS THE GLYPH GROWS. A 2px stroke that read as crisp at 14px
          reads as heavy at 20px, and this `×` would then be the boldest mark on a surface whose
          whole argument is quiet. */}
      <svg
        aria-hidden="true"
        fill="none"
        height="20"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.75"
        viewBox="0 0 16 16"
        width="20"
      >
        <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" />
      </svg>
    </button>
  );
}
