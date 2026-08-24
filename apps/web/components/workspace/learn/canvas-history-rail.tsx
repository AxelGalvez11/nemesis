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
// "now" unless the learner has rewound. That also satisfies the performance requirement outright —
// "no expensive rerender on every scroll frame" is free when nothing listens to scroll.
//
// 🔴 IT IS NOT A SCROLLBAR, AND THE WINDOWING IS WHY IT CANNOT BECOME ONE. A canvas may hold up to
// `MAX_MOMENTS` moments; drawing all 80 as a full-height column of ticks IS a scrollbar, and the
// brief rules that out by name. The rail shows the most recent `RAIL_MARKERS` around wherever the
// learner is.

import { useCallback, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type { CanvasHistoryEntry } from "@/lib/learn/canvas-history";
import { TITLE_LIMIT, shortTitle } from "@/lib/learn/canvas-history";

/** One component owns the interaction — the brief's own rule, and the reason this type is here.
 *  🔴 TWO STATES, NOT THREE: "expanded" left with the drawer it named (owner cut, 2026-08-23). */
export type HistoryRailDisplay = "collapsed" | "peek";

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

/** How long the peek waits before closing, so crossing the rail's own gap does not collapse it. */
const PEEK_GRACE_MS = 120;

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
  const [display, setDisplay] = useState<HistoryRailDisplay>("collapsed");
  const closing = useRef<number | null>(null);

  const open = useCallback(() => {
    if (closing.current !== null) window.clearTimeout(closing.current);
    closing.current = null;
    setDisplay("peek");
  }, []);

  const leave = useCallback(() => {
    if (closing.current !== null) window.clearTimeout(closing.current);
    closing.current = window.setTimeout(() => {
      setDisplay("collapsed");
      closing.current = null;
    }, PEEK_GRACE_MS);
  }, []);

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

  const peeking = display === "peek";
  /** "Now" is the active marker whenever nothing has been rewound to. */
  const live = activeMomentId === null;

  return (
    <>
      {/* ── desktop: the edge rail ────────────────────────────────────────────────────────────
          🔴 HIDDEN BELOW `md`, WHERE THE EDGE IS NOT OURS TO SPEND. Owner: *"On narrow mobile
          screens, the collapsed rail may become a small History button rather than consuming
          permanent edge space."* A CSS breakpoint rather than a measured one, so there is no
          layout read on mount and nothing to get wrong during hydration. (The small-screen
          button itself left with the drawer it opened — see the file header.) */}
      <div className="pointer-events-none absolute inset-y-0 right-0 z-30 hidden items-center md:flex">
        <div
          className="pointer-events-auto flex max-h-[70vh] items-center py-4 pl-6 pr-2"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) leave();
          }}
          onFocus={open}
          onMouseEnter={open}
          onMouseLeave={leave}
        >
          <nav
            aria-label="Canvas history"
            className={cn(
              "flex flex-col items-stretch rounded-lg py-2 transition-[background-color,box-shadow,padding,gap] duration-200 ease-out",
              // 🔴 THE STRIP ONLY GETS A SURFACE WHILE IT IS BEING READ. Collapsed it is bare
              // marks on the sheet — "nearly disappear until needed".
              //
              // 🔴🔴 TWO PITCHES, OPENED ONE STEP ON OWNER ORDER. The first pitches were 9px
              // collapsed (8px row + 1px gap) and 5px of peeked gap; the owner, reading the live
              // rail: *"just increase the spacing a bit."* So collapsed gap is 3px (11px pitch —
              // the ladder still reads as one object) and the peeked gap is 8px. Arithmetic at
              // the cap (25 marks): collapsed ≈322px, peeked ≈545px, both inside 70vh of an
              // 800px viewport — but the previous cap in this comment was ESTIMATED too and was
              // 2.2× wrong; measure after changing any metric here. `h-2` is 9px in this app
              // (`html { font-size: 112.5% }`), not 8.
              peeking
                ? "gap-[8px] bg-(--ui-bg-elevated)/95 px-2 shadow-lg ring-1 ring-(--ui-stroke-secondary) backdrop-blur-sm"
                : "gap-[3px] px-0",
            )}
          >
            {shown.map((entry) => (
              <RailMarker
                active={entry.momentId === activeMomentId}
                key={entry.id}
                label={shortTitle(entry.title, TITLE_LIMIT)}
                onSelect={() => onSelect(entry.momentId)}
                peeking={peeking}
              />
            ))}
            {/* 🔴 "NOW" IS THE LAST MARK, BECAUSE THE COLUMN RUNS FORWARD IN TIME. */}
            <RailMarker active={live} label="Now" onSelect={() => onSelect(null)} peeking={peeking} />
          </nav>
        </div>
      </div>
    </>
  );
}

/**
 * One marker: a thin rule collapsed, a labelled row while peeking.
 *
 * 🔴 THE ACTIVE ONE IS LONGER *AND* BRIGHTER, NOT ONE OR THE OTHER. Length survives a monochrome
 * surface at low opacity where a brightness step alone can be invisible; brightness survives a
 * viewport where every marker is the same length because they are all labelled. Together they
 * carry it in both states, which is what "clearly active marker" has to mean on a rail that
 * changes shape.
 */
function RailMarker({
  active,
  label,
  onSelect,
  peeking,
}: {
  active: boolean;
  label: string;
  onSelect: () => void;
  peeking: boolean;
}) {
  return (
    <button
      aria-current={active ? "true" : undefined}
      // 🔴 THE ACCESSIBLE NAME IS THE LABEL EVEN WHILE THE LABEL IS NOT PAINTED. Collapsed, this
      // is a 16px rule with no text in it; without this a screen reader reads a column of empty
      // buttons, which is exactly as useful as it sounds.
      aria-label={label}
      className={cn(
        "group flex items-center justify-end gap-2 transition-[height] duration-200 ease-out focus-visible:outline-none",
        // 🔴 A HIT TARGET, NOT A HAIRLINE. The rule itself is 1px; a 1px button cannot be clicked,
        // so the collapsed row is 8px of transparent space around it. With the nav's 3px gap the
        // column has no dead pixels — every point on the strip belongs to a marker or the gap
        // beside it.
        //
        // 🔴 EXPLICIT, BECAUSE THE HIDDEN LABEL IS NOT A RELIABLE ZERO. `max-w-0` clips the text
        // to nothing horizontally but leaves a full 12px line box behind, which is what made the
        // collapsed rail 2.2× taller than its own comment claimed. Height is stated here rather
        // than inherited from something invisible.
        peeking ? "h-auto" : "h-2",
      )}
      onClick={onSelect}
      type="button"
    >
      <span
        className={cn(
          "min-w-0 truncate text-right text-[length:var(--canvas-text-meta)] leading-none transition-[max-width,opacity] duration-200 ease-out",
          peeking ? "max-w-[11rem] opacity-100" : "max-w-0 opacity-0",
          active ? "text-(--ui-text-primary)" : "text-(--ui-text-tertiary) group-hover:text-(--ui-text-secondary)",
        )}
      >
        {label}
      </span>
      <span
        aria-hidden
        className={cn(
          "block shrink-0 rounded-full transition-all duration-200 ease-out",
          active
            ? "h-0.5 w-4 bg-(--ui-text-primary)"
            : "h-px w-2.5 bg-(--ui-text-tertiary) opacity-50 group-hover:w-4 group-hover:opacity-90",
        )}
      />
    </button>
  );
}
