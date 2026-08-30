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

import { useMemo } from "react";

import { useSidePanelInset } from "@/components/workspace/shell/side-panel";

import { cn } from "@/lib/utils";

import type { CanvasHistoryEntry } from "@/lib/learn/canvas-history";
import { TITLE_LIMIT, shortTitle } from "@/lib/learn/canvas-history";

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

/** How far the tooltip stands clear of the strip. Measured off the reference: its rail ends at 52
 *  and its tooltip starts at 72. */
const TOOLTIP_GAP_PX = 20;

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
        <div className="pointer-events-auto flex max-h-[70vh] items-center py-4 pl-6 pr-2">
          <nav
            aria-label="Canvas history"
            className={cn(
              // 🔴 ONE GEOMETRY, AND NOTHING HERE TRANSITIONS. The transition list used to name
              // background-color, box-shadow, padding and gap — the four properties the pop-up
              // animated. With one state there is nothing for them to animate between, and a
              // transition on a value that never changes is a promise nothing keeps.
              "flex flex-col items-stretch gap-[3px] rounded-lg py-2",
              // 🔴🔴 BARE MARKS ON THE SHEET, ALWAYS — "nearly disappear until needed". The strip
              // used to grow a surface while it was being read (`bg-(--ui-bg-elevated)/95`, a
              // shadow, a ring and a backdrop blur) and that surface is the "pop up" the owner
              // reported on 2026-08-29. See the file header for the measurement.
              //
              // 🔴 THE 3px GAP IS THE OWNER'S OWN NUMBER AND IS UNCHANGED. Reading the live rail on
              // 2026-08-23: *"just increase the spacing a bit."* That moved the collapsed gap from
              // 1px to 3px, an 12px pitch with the 9px row. It was never the thing that moved.
              // 🔴 `h-2` IS 9px IN THIS APP (`html { font-size: 112.5% }`), not 8. At the 24-marker
              // cap the column is ~288px, comfortably inside 70vh of an 800px viewport — and it is
              // now that height in every state, which is the point. Measure after changing any
              // metric here; the estimate in the note this replaces was 2.2x wrong.
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
        // 🔴 A HIT TARGET, NOT A HAIRLINE. The rule itself is 1px; a 1px button cannot be
        // clicked, so the row is 9px of transparent space around it. With the nav's 3px gap the
        // column has no dead pixels — every point on the strip belongs to a marker or the gap
        // beside it.
        //
        // 🔴 `relative` IS LOAD-BEARING: it is what the tooltip below is positioned against.
        // 🔴 `group` DRIVES BOTH the mark's widening and the tooltip's appearance from one hover,
        // so the two can never disagree about whether this row is the one being pointed at.
        "group relative flex h-2 shrink-0 items-center justify-end gap-2 focus-visible:outline-none",
      )}
      onClick={onSelect}
      type="button"
    >
      <span
        aria-hidden
        className={cn(
          "block shrink-0 rounded-full transition-all duration-200 ease-out",
          active
            ? "h-0.5 w-4 bg-(--ui-text-primary)"
            : "h-px w-2.5 bg-(--ui-text-tertiary) opacity-50 group-hover:w-4 group-hover:opacity-90",
        )}
      />
      {/* 🔴 THE LABEL, AS A TOOLTIP RATHER THAN A ROW — the 2026-08-29 change. It stands
          `TOOLTIP_GAP_PX` clear of the strip on the LEFT, because this rail is pinned to the right
          edge of the window and a tooltip to its right would be off screen. The reference floats
          its own 20px clear of a rail on the opposite edge; the number is theirs, the side is ours.

          🔴 `pointer-events-none`, SO IT CANNOT EAT THE CLICK IT DESCRIBES. It overlaps the reading
          column, and a learner aiming at the marker must not have the label intercept the press.

          🔴 14px THROUGH THE TOKEN, NEVER AS A BARE LENGTH. `--canvas-text-small` IS 14px, which is
          the reference's own list type, measured. §46.3's guard in canvas-shell.test.ts refuses a
          raw size precisely so a sixth type step cannot be introduced by whoever happened to
          measure one; it has caught this line twice, once for the size and once for a comment that
          spelled the banned utility out. Do not name that form here even to explain its absence.

          🔴 `max-w-[200px]` AND `truncate` ARE KEPT FROM THE ROW THIS REPLACES: the reference's
          sidebar is 260px with 10px of row padding a side, so 200 keeps the same share of a title
          readable before it clips. A tooltip that grew to fit any title would run across the whole
          answer. */}
      <span
        className={cn(
          "pointer-events-none absolute right-full top-1/2 z-10 -translate-y-1/2 truncate rounded-[8px]",
          "bg-(--ui-bg-elevated) px-[10px] py-[5px] text-left text-[length:var(--canvas-text-small)] leading-[20px]",
          "shadow-lg ring-1 ring-(--ui-stroke-secondary)",
          "max-w-[200px] opacity-0 transition-opacity duration-150 ease-out",
          "group-hover:opacity-100 group-focus-visible:opacity-100",
          active ? "text-(--ui-text-primary)" : "text-(--ui-text-secondary)",
        )}
        style={{ marginRight: TOOLTIP_GAP_PX }}
      >
        {label}
      </span>
    </button>
  );
}
