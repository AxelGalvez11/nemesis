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
//
// 🔴🔴 "SOMETIMES WON'T LET ME" (owner, 2026-08-26) WAS NEVER THIS FILE — every render branch this
// component reaches DOES carry a working `×`; that was re-verified on screen against the loading
// branch, a busy/turnInFlight surface, the Sources panel open, a docked and a full-screen reader,
// the legacy `orient` shape, and a mobile viewport, and all of them exit correctly. The actual
// defect was one layer out: `apps/web/app` has NO `error.tsx` anywhere, so a render exception
// thrown by ANYTHING in the 2000+ line `learning-canvas.tsx` — over real, sometimes-irregular
// session data — never reached this component at all, and fell through to Next's bare handling:
// no `×`, no rail, nothing. Confirmed by throwing deliberately with no boundary present. The fix
// is `app/(workspace)/learn/error.tsx`, which is safe to add one layer above `learning-canvas.tsx`
// rather than inside it, precisely because Next scopes an `error.tsx` OUTSIDE the segment it
// guards — `WorkspaceShell`, which owns the nav rail, stays mounted and interactive underneath it.
//
// 🔴 THE DEPARTURE IS NOW ANIMATED, AND `beginExit` BELOW IS WHERE. It reads as the arrival's own
// motion played backwards rather than a new effect — see `.canvas-exit-out` in globals.css, which
// was the arrival's curve, time-reversed, capped so the press still felt instant (removed with the
// a second press while already leaving skips the remainder rather than queuing behind it.

import type * as React from "react";
import { useEffect, useRef, useState } from "react";

import { useDeclareImmersiveSurface } from "@/components/workspace/shell/immersive-surface";
import { useSidePanelInset, useSidePanelLive } from "@/components/workspace/shell/side-panel";

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

/**
 * The narrow step, and it is the reference's own rule rather than a taste call.
 *
 * 🔴🔴 THEIR COLUMN IS NOT FIXED, WHICH IS WHY TWO HONEST MEASUREMENTS OF IT DISAGREED. Read off
 * the live class list, 2026-08-31:
 *
 *   [--thread-content-max-width:40rem] @[53.5rem]/main:[--thread-content-max-width:48rem]
 *
 * A CONTAINER query, not a viewport one: 640px of text while the thread's own area is under 856px,
 * 768px at or above it. The 2026-08-26 note in this file measured 768 on a 1470px window and set
 * this constant to match; today the same account measured 640 with the sidebar open, because the
 * area was 848px. Both readings were correct and neither was the whole rule.
 *
 * 🔴 A CONTAINER QUERY IS ALSO THE ONLY ONE THAT CAN BE RIGHT HERE, because this surface narrows
 * for the reading pane (#913). A viewport query would keep the wide column while the pane squeezed
 * the text to two thirds of it.
 *
 * Same arithmetic as the constant above: this is the OUTSIDE of the box, and `px-6` is 27px a side
 * against this app's 112.5% root, so 694 - 54 = 640 of text.
 */
const CANVAS_COLUMN_NARROW_PX = "694px";

/** Where the reference steps between the two. 53.5rem at ITS 16px root. */
const CANVAS_COLUMN_STEP_PX = 856;

/**
 * How long the departure is allowed to hold the press before the route actually changes.
 *
 * 🔴🔴 A CEILING, NOT A DESIGN CHOICE (owner: *"never make the exit slower to respond ... an
 * animated departure must still feel instant to the press"*). `canvas-home.tsx`'s own arrival
 * holds the navigation for `DOCK_MS` — 320ms — because that trip has somewhere real to land: a
 * measured rectangle on the page about to mount. This one does not (see `.canvas-exit-out` in
 * globals.css for why it does not try to fly the character to a guessed target), so there is
 * nothing here worth 320ms of the learner's attention. 200 is the number the brief names.
 */

interface CanvasSurfaceProps {
  /** Leaves the canvas. Always wired; there is no state in which this control is absent. */
  /** The rest of the floating control strip — title, sources, objectives. Optional because a
   *  canvas that has not loaded yet has nothing to title, and 🔴 that is precisely the state that
   *  used to render no exit either. */
  chrome?: React.ReactNode;
  children: React.ReactNode;
  /** Files dropped anywhere on the canvas. Absent while the session is still loading, because
   *  there is nothing yet to attach them to. */
  onDropFiles?: (files: FileList) => void;
}

export function CanvasSurface({ chrome, children, onDropFiles }: CanvasSurfaceProps) {
  // §38.1 — "Side bar should also not be visible when inside canvas." The whole rail, not the
  // toggle. This is what makes the exit below load-bearing rather than decorative, which is why
  // the two live in the same component: you cannot take the claim without taking the `×` with it.
  useDeclareImmersiveSurface();
  // 🔴🔴 A SMOOTH DEPARTURE, WHERE THE ARRIVAL HAD ONE AND THE EXIT USED TO HARD-CUT. Owner:
  // *"investigate exiting out of the canvas ... and make sure it has a smooth animation."* See
  // `.canvas-exit-out` in globals.css for the motion itself and why it is the arrival's own curve
  // played backwards rather than a new effect.
  //
  // 🔴 A REF FOR THE TIMER, NOT A CLOSURE `setTimeout` DISCARDS. `beginExit` has to be able to
  // CANCEL the wait it started — a second press must skip straight to leaving, never queue a
  // second one behind the first.
  // 🔴🔴 THE DEPARTURE ANIMATION WENT WITH THE `×` (owner, 2026-08-31: *"since chat is default,
  // the '×' should be gone from the chats"*). `beginExit` existed to play `.canvas-exit-out` for
  // 200ms and then call `onExit`, and the `×` was its only caller — so keeping it would have left
  // a state machine, a timer, a cleanup effect and a CSS class that nothing on the surface could
  // ever reach, under a comment saying they were alive. You leave a chat by opening another one
  // from the rail now, which is a route change this component never sees.
  //
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
  // 🔴🔴 AND WHETHER IT IS BEING DRAGGED. Owner, 2026-09-01: *"no lagg in sizing adjustment for
  // chat and sidebar."* The transition below is what makes an OPENING panel read as an arrival; on
  // the intermediate widths a drag produces it is the opposite — the panel's edge tracks the
  // pointer exactly while the conversation's edge eases toward it 220ms behind, so the two sides of
  // one seam are visibly apart for as long as the button is held, then snap together on release.
  // The panels already drop their own animation while dragging; this is the same fact reaching the
  // element that was still easing.
  const draggingPanel = useSidePanelLive();

  return (
    <main
      // 🔴 THE ARRIVAL STILL ANIMATES; only the departure is gone. The masthead and the header's
      // own `.canvas-chrome-in` fade share this surface without coordinating — each plays once at
      // mount. See the note above for why `.canvas-exit-out` no longer has a trigger.
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
      // 🔴 THE HANDLE THE COLUMN'S CONTAINER QUERY HANGS ON. See `canvas-surface` in globals.css.
      data-canvas-surface=""
      style={{
        ["--canvas-column" as string]: CANVAS_COLUMN_PX,
        // The transition is what makes the push read as the panel arriving rather than the page
        // jumping — and it is the SHARED clock now (`--pane-slide`, globals.css), so the canvas,
        // the panel and the nav column all settle on the same frame instead of 40ms apart.
        transition: draggingPanel ? "none" : "width var(--pane-slide)",
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

          🔴 SOLID, AND SHORTER THAN THE CONTENT'S RESTING OFFSET. 44px clears the 12px/28px control
          row and still stops 4px short of `pt-[48px]`, so at rest it covers
          nothing at all and there is no row where a letter is half-painted. It draws no visible
          edge for the same reason the gradient claimed to: it is the page's own colour. What it
          gives up is the soft hand-off — scrolled text now ends at a hard line instead of thinning
          out — which is what the reference does too, and is the price of text that is never
          half-erased. */}
      {/* 🪦 THE MASTHEAD BAND STOOD HERE AND IS GONE — owner, 2026-09-03, twice in one afternoon.
          First as a full-width strip: *"there still seems to be a header block up top that's
          blocking the page."* I anchored it to the controls instead (`right-0 w-[280px]`) and he
          reported it AGAIN, with the block circled in the top right corner — and he was right the
          second time for a reason the first fix created. **The learner's bubbles are
          right-aligned.** A right-anchored band sits exactly on top of them, so a question
          scrolling up lost its right half to an opaque rectangle while its left half stayed: a far
          more obviously broken thing than the strip it replaced.

          🔴 NEITHER GEOMETRY WORKS, WHICH IS THE ARGUMENT FOR NEITHER. Full width hides a line of
          the conversation; right-anchored hides half a bubble. The band existed so text would not
          run under the floating controls — so the ground belongs ON the controls, which is where
          the reference puts it and where it can never cover anything that is not behind them.
          `canvas-header.tsx` carries it now.

          🔴 AND HE HAD ALREADY ASKED FOR THIS, in the same words, when the canvas title went:
          *"remove that top block header because that's taken away from the reading of the chat."*
          The band was the rest of that block. */}


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
      {/* 🔴🔴 `z-40` — THE CHROME OUTRANKS THE HISTORY RAIL, AND `z-30` MEANT IT DID NOT. Owner,
          2026-09-03, with the Sources panel open: *"when you open the source you can still see the
          right rail ticker; the source panel shall open in front of that."* Reproduced on
          production: the rail's marks printed straight across the open panel.

          The panel's own `z-40` could not save it, because the panel is INSIDE this header and this
          header is a stacking context. A z-index only competes with its siblings, so the panel was
          pinned to whatever level its ancestor holds — and this header and the rail's column
          (`canvas-history-rail.tsx`) both held `z-30`. Equal levels fall back to document order,
          and the rail is a sibling of `{children}` below, so it painted last and therefore on top.
          Raising the PANEL is the fix that looks obvious and does nothing at all.

          🔴 NOTHING ABOVE THIS MOVES. The reading pane (`source-tab-viewer.tsx`) also holds `z-40`
          and is mounted after `{children}`, so it still covers this header exactly as it did at
          `z-30` — a document opened beside the canvas is meant to own that corner. What changes is
          only the rail, which is a fixture of the page and must never sit over a control. */}
      <header
        className="canvas-chrome-in pointer-events-none absolute right-[12px] top-[12px] z-40 flex h-[36px] items-center gap-1"
        style={{ left: "calc(12px + var(--nav-toggle-inset, 0px))" }}
      >
        {/* 🔴🔴 NO `×` ON A CHAT (owner, 2026-08-31: *"since chat is default, the '×' should be gone
            from the chats"*). It existed because §38.1 took the rail away and made it the only way
            out; the rail is back as of #995, so the × was a second exit sitting in the corner the
            shell's own toggle also paints in. A conversation you leave by clicking another one in
            the sidebar does not need a close button, and ChatGPT has none.
            🔴 THE DEPARTURE MACHINERY WENT WITH IT — see the note in the body. It had exactly one
            caller, and a timer nothing can start is not a feature in reserve, it is a lie. */}
        {chrome}
      </header>

      {children}
    </main>
  );
}
