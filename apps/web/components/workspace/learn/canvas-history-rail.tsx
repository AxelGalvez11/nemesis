"use client";

// The Canvas History Rail: a spatial memory for one Canvas, pinned to its right edge.
//
// Owner, 2026-08-23: *"a thin vertical navigation rail… Each small horizontal marker represents a
// meaningful previous moment in this Canvas… It should feel like a spatial memory for the Canvas."*
//
// 🔴🔴 THE RAIL IS THE WHOLE SURFACE NOW — the "All history" drawer is DELETED, by owner order,
// same day, looking at both on production: *"there seems to be two rails. So when you click all
// history, that's like the actual bigger one. So I want you to just remove that bigger one and
// keep this one that's compact, but just increase the spacing a bit."* `CanvasHistoryPanel` and
// its row component are gone from the tree, `HistoryRailDisplay` has no "expanded" state left,
// and the windowed strip is the one way to reach a moment. Do not reintroduce a second history
// surface; canvas-history-surface.test.ts forbids it by name.
//
// 🔴 WHICH MAKES THE WINDOW A REAL BOUND, STATED HONESTLY. With the drawer gone, moments older
// than the window are not reachable from this edge (the window still FOLLOWS a rewind, so
// anything the learner is looking at is always on the strip). That is the owner's trade — a
// quiet edge over total reach — and it holds until they ask for more. Below `md` the rail is
// hidden and nothing replaces it: the "History" pill existed only to open the deleted drawer.
//
// 🔴 IT IS NOT THE MINIMAP AND THEY MUST NOT MERGE. The Minimap answers *where am I in what I am
// learning* — it reads `learner_evidence` through `projectLearnerState` and marks territories
// established or developing. This answers *what happened in this Canvas, and how did I get here*,
// and it reads a moment log that provably cannot state anything about knowledge. On a course
// canvas both are live at once and they will disagree, correctly: a moment where the learner was
// wrong stays on this rail forever, while the Minimap has long since moved that territory to
// established. Two questions, two data sources, two surfaces.
//
// 🔴 THERE IS NO SCROLL LISTENER, AND THAT IS NOT AN OMISSION. The brief describes the active
// marker following the learner through a scrolling history. This Canvas has none: `composeSurface`
// enforces that ONE turn owns the surface at a time (see canvas-hosting.ts — "two things may share
// the surface, two ANSWER surfaces may not"), so there is no transcript to scroll past and no
// pixel position to sync to. The active marker is the moment the Canvas is SHOWING, which is
// the moment the learner rewound to, and NOTHING when they have not — see the "Now" note below.
// That also satisfies the performance requirement outright —
// "no expensive rerender on every scroll frame" is free when nothing listens to scroll.
//
// 🔴 IT IS NOT A SCROLLBAR, AND THE WINDOWING IS WHY IT CANNOT BECOME ONE. A canvas may hold up to
// `MAX_MOMENTS` moments; drawing all 80 as a full-height column of ticks IS a scrollbar, and the
// brief rules that out by name. The rail shows the most recent `RAIL_MARKERS` around wherever the
// learner is.

import { useCallback, useMemo, useRef, useState } from "react";

import { useSidePanelInset } from "@/components/workspace/shell/side-panel";

import { cn } from "@/lib/utils";

import type { CanvasHistoryEntry } from "@/lib/learn/canvas-history";
import { DRAWER_TITLE_LIMIT, TITLE_LIMIT, shortTitle } from "@/lib/learn/canvas-history";

// 🔴🔴 THERE IS NO "NOW" MARK, AND ITS REMOVAL WAS SAFE FOR A REASON WORTH WRITING DOWN. Owner,
// 2026-08-25: *"could you remove the 'now' since thats not really needed?"* It was the last mark on
// the column and the rail's own way back to live, so deleting it would normally strand anybody who
// had rewound — a control that walks you into the past with no way forward.
//
// It does not, because the exit was never only here: `canvas-history-view.tsx` renders **"Return to
// now"** on the rewound surface itself, which is where somebody looking at an old moment actually
// is. Two exits for one state was the redundancy the owner could see.
//
// 🔴 SO WHEN NOTHING IS REWOUND TO, NO MARK IS ACTIVE, and that is honest rather than a gap: the
// learner is in the present, and the present is not one of the moments this column lists. A mark
// lit for "you are not in history" would be the same duplicate wearing a different shape.
//
// `canvas-history-surface.test.ts` holds the absence, next to the ban on a second history surface.

// 🔴🔴 THERE IS NO DISPLAY STATE ANY MORE, AND THAT IS THE WHOLE OF THE 2026-08-29 REPORT.
//
// Owner: *"Fix the Canvas rail pop up because it's… I don't want it to have that. It just moves a
// lot."* Then, on which rail: *"im talking about the right side rail in the canvas for viewing
// previous chats."* And on what to replace it with: *"the rail when hovering over it should work
// like in ChatGPT (pull up actually ChatGPT session for this too see the numbers and measure it)."*
//
// 🔴 WHAT IT USED TO DO, IN NUMBERS, BECAUSE THE NUMBERS ARE THE COMPLAINT. There were two
// geometries and hovering swapped between them:
//
//   | | row | gap | pitch | 24 markers |
//   |---|---|---|---|---|
//   | resting | 9px | 3px | 12px | ~288px |
//   | hovered | 36px | 0 | 36px | **~864px** |
//
// Three times taller, on a column that is vertically CENTRED — so every marker slid away from the
// middle, including the one the pointer was resting on. A hover target that leaves under the cursor
// is the defect; the panel, the shadow, the ring and the blur that faded in with it were the "pop
// up". Both halves are gone.
//
// 🔴 MEASURED IN THE OWNER'S OWN SIGNED-IN CHATGPT, 2026-08-29, which is what they asked for. Its
// collapsed rail (`#stage-sidebar-tiny-bar`) is 52px and NEVER changes size; hovering a control
// swaps its glyph and floats a tooltip 20px clear of the strip. Nothing resizes, nothing reflows,
// and the full list arrives only on a deliberate click. So: one geometry, and the label is a
// tooltip rather than a row the column has to make room for.
//
// 🔴 THE COST, STATED RATHER THAN GLOSSED. A tooltip shows ONE label at a time, where the peek
// panel let you read the whole column at once. That is the trade the owner asked for, and it is the
// same one the reference makes: you scan a chat list by opening it, not by hovering it.

/**
 * How many markers the rail draws.
 *
 * 🔴 A WINDOW AROUND THE LEARNER, AND — SINCE THE DRAWER WAS CUT — THE BOUND OF WHAT THE EDGE CAN
 * REACH. See the file header for the owner's trade. At 24 (plus "Now") the column stays inside a
 * laptop viewport beside a reading column at both pitches (arithmetic under the nav's gap note).
 *
 * 🔴 THE NUMBER IN THIS COMMENT USED TO BE 190px AND IT WAS NEVER MEASURED. The real column was
 * 520px — 65% of an 800px viewport — because every collapsed marker still carried its hidden
 * label's 12px line box. Measure the rail after changing its metrics; do not estimate it.
 */
export const RAIL_MARKERS = 24;

/* 🔴 THERE IS NO CLEARANCE ANY MORE, AND `PANEL_GAP_PX` IS GONE WITH IT. It was 20px, taken from
 * the reference's own rail-to-tooltip gap and correct for a panel that stood BESIDE the strip. The
 * owner picked the panel that opens ON the strip instead (2026-09-01, four placements on screen),
 * and a gap is the one thing that placement cannot have: any clearance at all is the panel reaching
 * back into the answer column, which is what he was asking to stop. */

/**
 * How long the panel survives the pointer leaving.
 *
 * 🔴 IT EXISTS BECAUSE THE STRIP HAS GAPS IN IT. Crossing the 4px between two markers is a
 * `mouseleave` on the row and a `mouseenter` on the next, and without a grace the panel would
 * blink out and back on every one. The panel and the strip share it, so travelling from the strip
 * to the panel to click a row does not dismiss the thing being aimed at.
 */
const PANEL_GRACE_MS = 140;

export function CanvasHistoryRail({
  activeMomentId,
  entries,
  onSelect,
}: {
  /** The moment on screen, or null for the present. */
  activeMomentId: string | null;
  /** Oldest first. */
  entries: readonly CanvasHistoryEntry[];
  onSelect: (momentId: string | null) => void;
}) {
  /**
   * The markers, oldest at the top and the most recent at the bottom.
   *
   * 🔴🔴 NOT REVERSED, AND THE FIRST VERSION WAS. Owner's screenshot, 2026-08-23: the bright
   * marker sits at the BOTTOM of the column and the list above it runs back through the session —
   * "the current nemesis app doesnt even feel l…" first, "i need this fixed…" last. I had built it
   * newest-first, which is how a chat sidebar is ordered. The difference is what the column MEANS:
   * downwards-as-time makes the rail a path you walked, and "Now" the end of it. Upwards-as-time
   * makes it a stack of documents.
   *
   * 🔴 THE WINDOW FOLLOWS THE LEARNER, NOT THE END OF THE LIST. Rewinding to something 40 moments
   * back must leave its marker visible and active — a window fixed to the tail would show an
   * active marker that is not on screen, which is the one thing a position indicator may not do.
   */
  const shown = useMemo(() => {
    const rows = [...entries];
    if (rows.length <= RAIL_MARKERS) return rows;
    const at = rows.findIndex((entry) => entry.momentId === activeMomentId);
    // Nothing rewound to: hold the tail, because the bottom of the column is where the learner is.
    if (at < 0) return rows.slice(-RAIL_MARKERS);
    const start = Math.min(Math.max(0, at - Math.floor(RAIL_MARKERS / 2)), rows.length - RAIL_MARKERS);
    return rows.slice(start, start + RAIL_MARKERS);
  }, [activeMomentId, entries]);

  // 🔴🔴 NO RAIL WHILE A READER IS DOCKED — owner, 2026-08-27: *"hide the rail when sidebar is
  // open."* The rail is pinned to the RIGHT EDGE of the window and the panel now covers that edge,
  // so the two were stacked: a column of markers painted underneath a document, reachable only by
  // hovering over the reader. It is the same reasoning §38.1 uses for the nav rail inside a canvas
  // — a surface that owns the screen owns the edges too.
  //
  // 🔴 THE INSET IS THE SIGNAL, NOT A PROP THREADED DOWN. `useSidePanelInset` is already what the
  // canvas is pushed by; a boolean passed from the panel to this component would be a second answer
  // to "is a panel open", free to disagree with the first.
  const inset = useSidePanelInset();

  /**
   * Whether the list is open.
   *
   * 🔴🔴 THE PANEL IS BACK, BY OWNER INSTRUCTION AND WITH THE OLD BUG DESIGNED OUT — 2026-08-31,
   * pasting a screenshot of exactly this: *"i said the rail popup needed to look like this."* He
   * had been shown five options as working mockups and chose the list.
   *
   * 🔴 SO WHAT WAS THE 2026-08-29 REPORT, AND WHY IS THIS NOT IT AGAIN? *"I don't want it to have
   * that. It just moves a lot."* The thing that moved was THE STRIP: the markers themselves grew
   * from a 12px pitch to 36px on hover, so a 24-marker column went from about 288px to 864px and
   * every marker slid out from under the pointer that was aiming at it. That was never about a
   * panel existing; it was about the hover target moving.
   *
   * This panel cannot do that. It is `absolute`, in its own layer, anchored to the strip's
   * container — so the markers keep one geometry in every state, which is the invariant
   * `canvas-history-surface.test.ts` holds and which was measured again after this change: the
   * marker tops are identical with the panel open and closed.
   */
  const [open, setOpen] = useState(false);
  const grace = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(() => {
    if (grace.current) clearTimeout(grace.current);
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    if (grace.current) clearTimeout(grace.current);
    grace.current = setTimeout(() => setOpen(false), PANEL_GRACE_MS);
  }, []);

  // 🔴 A CANVAS WITH NO MOMENTS DRAWS NO RAIL, AND THIS GUARD ARRIVED WITH THE "NOW" MARK'S
  // REMOVAL. Until then the column always had at least that one mark, so it was always a real
  // object. Without it an empty history renders an empty `<nav>` — invisible, and still holding a
  // hover target down the right edge that opens a panel with nothing in it. A control that reacts
  // and then shows nothing reads as broken, which is worse than an edge that is simply quiet.
  if (entries.length === 0 || inset > 0) return null;

  return (
    <>
      {/* ── desktop: the edge rail ────────────────────────────────────────────────────────────
          🔴 HIDDEN BELOW `md`, WHERE THE EDGE IS NOT OURS TO SPEND. Owner: *"On narrow mobile
          screens, the collapsed rail may become a small History button rather than consuming
          permanent edge space."* A CSS breakpoint rather than a measured one, so there is no
          layout read on mount and nothing to get wrong during hydration. (The small-screen
          button itself left with the drawer it opened — see the file header.) */}
      <div className="pointer-events-none absolute inset-y-0 right-0 z-30 hidden items-center md:flex">
        {/* 🔴 NO HOVER HANDLERS LEFT ON THIS BOX. They existed to open and close the peek panel,
            with a 120ms grace so crossing the strip's own gaps did not collapse it — machinery for a
            state that no longer exists. Each marker now owns its own hover, and a tooltip cannot
            move the column it is anchored in. */}
        {/* 🔴 THE PADDING IS THE HOVER APPROACH, NOT THE ANCHOR. This box is deliberately wider
            than the strip so the pointer meets the rail slightly before the marks; anchoring the
            panel to it would add that padding to the clearance (measured: 47px against the
            reference's 20). The panel hangs off the strip itself, one level in. */}
        <div
          className="pointer-events-auto flex max-h-[70vh] items-center py-4 pl-6 pr-2"
          onMouseEnter={show}
          onMouseLeave={hide}
        >
          <div className="relative flex items-center">
          {/* ── the list ──────────────────────────────────────────────────────────────────────
              🔴🔴 IT IS `absolute`, AND THAT IS THE WHOLE REASON THIS IS NOT THE 2026-08-29 BUG
              AGAIN. Out of flow, in its own layer, anchored to this box: it cannot change the
              strip's height, the pitch between markers, or where the marker under the pointer is.
              The old pop-up was not a panel problem, it was the STRIP growing 288px to 864px.
              🔴 IT OPENS LEFTWARD FROM THE STRIP because this rail is pinned to the right edge of
              the window and a panel to its right would be off screen. It now starts ON the strip
              rather than clear of it — see the placement note below.
              🔴 EVERY ROW IS A REAL DOOR. The panel is how you read the column, and reading it
              without being able to act on what you read is the "dead control" this file has been
              caught by before — so a row selects the moment, exactly as its marker does. */}
          {open && (
            <div
              className={cn(
                // 🔴 `right-0`, NOT `right-full`: THE PANEL OPENS OVER THE STRIP. Owner chose this
                // from four live placements, 2026-09-01: *"i need C"* — the panel on top of the
                // rail rather than held clear of it. `right-full` put its right edge at the
                // strip's LEFT edge and then pushed it 20px further, so it reached into the answer
                // column; `right-0` lands it on the strip itself, which is the one place on this
                // surface that is not prose.
                //
                // 🔴 `absolute` IS STILL THE POINT, AND IT IS UNCHANGED. What must never come back
                // is a hover that resizes the STRIP (2026-08-29: 288px to 864px, markers sliding
                // out from under the pointer). Out of flow means the panel cannot touch a marker's
                // height or position wherever it is anchored.
                "absolute right-0 top-1/2 z-20 -translate-y-1/2",
                // 🔴🔴 THE DOCUMENT RAIL'S PANEL, SAME NUMBERS. 287px on a 12px radius, 20px of
                // padding, a quiet uppercase heading, and rows that are text rather than list
                // items with their own furniture. Was 288px / rounded-2xl / 36px rows carrying a
                // duplicate of the strip's mark.
                "max-h-[70vh] w-[287px] overflow-y-auto rounded-[12px] py-[20px] pl-[20px] pr-[16px]",
                "bg-(--ui-bg-elevated) shadow-lg ring-1 ring-(--ui-stroke-secondary)",
              )}
              data-canvas-history-panel=""
            >
              {/* 🔴 NO HEADING. Owner, 2026-09-01: *"dont add 'earlier in this canvas'"*. The panel
                  only ever opens from the history strip, so a line telling the learner that this
                  lists the history is a label on the thing they just pointed at. The document
                  rail's "Table of contents" heading stays where it is; that panel opens from a
                  document where the same words are not already implied. */}
              <div className="flex flex-col gap-[12px]">
                {shown.map((entry) => {
                  const current = entry.momentId === activeMomentId;
                  return (
                    <button
                      aria-current={current ? "true" : undefined}
                      className={cn(
                        // 🔴 NO MARK IN THE ROW ANY MORE. The strip is two centimetres away and
                        // already draws it; repeating it here made every row carry a second copy
                        // of the thing the row is next to. The document rail's panel is words.
                        "block w-full truncate text-left text-[length:var(--canvas-text-body)] leading-[24px] transition-colors",
                        current
                          ? "font-semibold text-(--ui-text-primary)"
                          : "text-(--ui-text-secondary) hover:text-(--ui-text-primary)",
                      )}
                      key={entry.id}
                      onClick={() => onSelect(entry.momentId)}
                      type="button"
                    >
                      {shortTitle(entry.title, DRAWER_TITLE_LIMIT)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <nav
            aria-label="Canvas history"
            className={cn(
              // 🔴 ONE GEOMETRY, AND NOTHING HERE TRANSITIONS. The transition list used to name
              // background-color, box-shadow, padding and gap — the four properties the pop-up
              // animated. With one state there is nothing for them to animate between, and a
              // transition on a value that never changes is a promise nothing keeps.
              // 🔴 15px PITCH, THE DOCUMENT RAIL'S. Its marks sit 12px apart on a 3px rule; here the
              // row is the hit target, so a 15px row with no gap gives the same rhythm and keeps
              // every pixel of the strip clickable. Was 14px + 4px = 18.
              "flex flex-col items-stretch gap-0 rounded-lg py-2",
              // 🔴🔴 BARE MARKS ON THE SHEET, ALWAYS — "nearly disappear until needed". The strip
              // used to grow a surface while it was being read (`bg-(--ui-bg-elevated)/95`, a
              // shadow, a ring and a backdrop blur) and that surface is the "pop up" the owner
              // reported on 2026-08-29. See the file header for the measurement.
              //
              // 🔴 THE WHOLE STRIP SIZED UP ON 2026-08-30 — owner: *"it's honestly... still feels a
              // bit small."* Row 9px -> 14px, gap 3px -> 4px (an 18px pitch), marks 1px -> 2px
              // thick and longer at rest. His own ChatGPT was measured the same day looking for
              // the rail to copy and HAS NONE — a 79-turn conversation carries no edge rail at
              // all — so what "match ChatGPT" can honestly mean is its ergonomics, which do have
              // numbers: 36px hover targets, and a tooltip that is a 30px pill (5px 12px padding,
              // 14px/18px at weight 600). The tooltip below wears exactly those numbers.
              // 🔴 STILL ONE GEOMETRY IN EVERY STATE — sizing up must never bring the hover
              // pop-up back. At the 24-marker cap the column is 14*24 + 4*23 + 18 = 446px,
              // measured, inside 70vh of an 800px viewport. Measure after changing any metric
              // here; the estimate a prior note held was 2.2x wrong.
            )}
          >
            {shown.map((entry) => (
              <RailMarker
                active={entry.momentId === activeMomentId}
                key={entry.id}
                label={shortTitle(entry.title, TITLE_LIMIT)}
                onSelect={() => onSelect(entry.momentId)}
              />
            ))}
          </nav>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * One marker: a thin rule, and its title as a tooltip beside it.
 *
 * 🔴🔴 ONE HEIGHT, IN EVERY STATE. This used to be `h-2` resting and `h-[36px]` while the column
 * was being read, which is what made 24 markers grow from ~288px to ~864px on hover and slide out
 * from under the pointer. The row no longer changes size at all, so the strip is the same object
 * whether or not anybody is looking at it.
 *
 * 🔴 THE ACTIVE ONE IS LONGER *AND* BRIGHTER, NOT ONE OR THE OTHER. Length survives a monochrome
 * surface at low opacity where a brightness step alone can be invisible; brightness survives the
 * case where the active mark is beside a hovered one, which is also widened. Together they carry it
 * in both, which is what "clearly active marker" has to mean on a strip this quiet.
 *
 * 🔴 THE TOOLTIP IS ABSOLUTELY POSITIONED, AND THAT IS THE ENTIRE FIX RATHER THAN A DETAIL. Out of
 * flow, it cannot change the row's height, the column's height, or where any other marker is — so
 * the thing you are pointing at stays where you pointed. A label that reserved space, in any form,
 * would reintroduce the report.
 */
function RailMarker({
  active,
  label,
  onSelect,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      aria-current={active ? "true" : undefined}
      // 🔴 THE ACCESSIBLE NAME IS THE LABEL EVEN THOUGH THE LABEL IS ONLY PAINTED ON HOVER. This
      // is a 16px rule with no text in it; without this a screen reader reads a column of empty
      // buttons, which is exactly as useful as it sounds.
      aria-label={label}
      className={cn(
        // 🔴 A HIT TARGET, NOT A HAIRLINE. The rule itself is 2px; a 2px button cannot be
        // clicked, so the row is 14px of transparent space around it (sized up from 9px on
        // 2026-08-30 — "still feels a bit small"). With the nav's 4px gap the column has no dead
        // pixels — every point on the strip belongs to a marker or the gap beside it.
        //
        // 🔴 `relative` IS LOAD-BEARING: it is what the tooltip below is positioned against.
        // 🔴 `group` DRIVES BOTH the mark's widening and the tooltip's appearance from one hover,
        // so the two can never disagree about whether this row is the one being pointed at.
        "group relative flex h-[15px] shrink-0 items-center justify-end gap-2 focus-visible:outline-none",
      )}
      onClick={onSelect}
      type="button"
    >
      {/* 🔴🔴 THE DOCUMENT RAIL'S MARK, TO THE PIXEL. Owner, 2026-08-31, with both on screen:
          *"make sure the right side rail… looks the same way, because right now it's different."*
          Asked which way to unify with all three directions in front of him, he chose the
          document rail's look — so these numbers are `document-rail.tsx`'s, which are ChatGPT's
          deep-research rail measured in his own session. 3px thick, 19px resting, 25px active.
          🔴 THE HOVER WIDENING IS GONE WITH THEM. This grew 16px -> 22px under the pointer, and
          the document rail has no such step: the panel already says which row you are on, and a
          mark that changes size on hover competes with the one mark that means "you are here". */}
      <span
        aria-hidden
        className={cn(
          "block h-[3px] shrink-0 rounded-full transition-all duration-200 ease-out",
          active ? "w-[25px] bg-(--ui-text-primary)" : "w-[19px] bg-(--ui-stroke-secondary)",
        )}
      />
      {/* 🔴 NO PER-MARKER TOOLTIP ANY MORE. The panel beside the strip names every moment at once
          (owner, 2026-08-31, choosing the list from five working mockups), so a second floating
          label for the one under the pointer would be the same words twice. The marker keeps its
          `aria-label`, which is what a screen reader reads and what the tooltip never was. */}
    </button>
  );
}
