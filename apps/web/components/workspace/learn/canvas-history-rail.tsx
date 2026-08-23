"use client";

// The Canvas History Rail: a spatial memory for one Canvas, pinned to its right edge.
//
// Owner, 2026-08-23: *"a thin vertical navigation rail… Each small horizontal marker represents a
// meaningful previous moment in this Canvas… It should feel like a spatial memory for the Canvas."*
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
// learner is, and the drawer is how you reach the rest.

import { useCallback, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type { CanvasHistoryEntry } from "@/lib/learn/canvas-history";
import { TITLE_LIMIT, shortTitle } from "@/lib/learn/canvas-history";

import { CanvasHistoryDrawer } from "./canvas-history-drawer";

/** One component owns the interaction — the brief's own rule, and the reason this type is here. */
export type HistoryRailDisplay = "collapsed" | "peek" | "expanded";

/**
 * How many markers the rail draws.
 *
 * 🔴 A WINDOW, NOT A LIMIT ON HISTORY. Everything is always reachable through the drawer; this is
 * about what a quiet edge strip can hold without becoming a texture. At 24 the column is about
 * 190px tall, which sits comfortably inside a laptop viewport beside a reading column.
 */
export const RAIL_MARKERS = 24;

/** How long the peek waits before closing, so crossing the rail's own gap does not collapse it. */
const PEEK_GRACE_MS = 120;

export function CanvasHistoryRail({
  activeMomentId,
  entries,
  nowSubtitle,
  onSelect,
}: {
  /** The moment on screen, or null for the present. */
  activeMomentId: string | null;
  /** Oldest first. */
  entries: readonly CanvasHistoryEntry[];
  nowSubtitle?: string;
  onSelect: (momentId: string | null) => void;
}) {
  const [display, setDisplay] = useState<HistoryRailDisplay>("collapsed");
  const closing = useRef<number | null>(null);

  const open = useCallback(() => {
    if (closing.current !== null) window.clearTimeout(closing.current);
    closing.current = null;
    setDisplay((current) => (current === "expanded" ? current : "peek"));
  }, []);

  const leave = useCallback(() => {
    if (closing.current !== null) window.clearTimeout(closing.current);
    closing.current = window.setTimeout(() => {
      setDisplay((current) => (current === "expanded" ? current : "collapsed"));
      closing.current = null;
    }, PEEK_GRACE_MS);
  }, []);

  /**
   * The markers, newest at the bottom.
   *
   * 🔴 THE WINDOW FOLLOWS THE LEARNER, NOT THE END OF THE LIST. Rewinding to something 40 moments
   * back must leave its marker visible and active — a window fixed to the tail would show an
   * active marker that is not on screen, which is the one thing a position indicator may not do.
   */
  const shown = useMemo(() => {
    const rows = [...entries].reverse();
    if (rows.length <= RAIL_MARKERS) return rows;
    const at = rows.findIndex((entry) => entry.momentId === activeMomentId);
    if (at < 0) return rows.slice(0, RAIL_MARKERS);
    const start = Math.min(Math.max(0, at - Math.floor(RAIL_MARKERS / 2)), rows.length - RAIL_MARKERS);
    return rows.slice(start, start + RAIL_MARKERS);
  }, [activeMomentId, entries]);

  const peeking = display === "peek";
  const expanded = display === "expanded";
  /** "Now" is the active marker whenever nothing has been rewound to. */
  const live = activeMomentId === null;

  return (
    <>
      {/* ── desktop: the edge rail ────────────────────────────────────────────────────────────
          🔴 HIDDEN BELOW `md`, WHERE THE EDGE IS NOT OURS TO SPEND. Owner: *"On narrow mobile
          screens, the collapsed rail may become a small History button rather than consuming
          permanent edge space."* A CSS breakpoint rather than a measured one, so there is no
          layout read on mount and nothing to get wrong during hydration. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-30 hidden items-center md:flex",
          // Out of the way while the drawer is over it. Two things saying "you are here" at once
          // is worse than one.
          expanded && "opacity-0",
          "transition-opacity duration-200",
        )}
      >
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
              "flex flex-col items-stretch gap-[7px] rounded-lg py-2 transition-[background-color,box-shadow,padding] duration-200 ease-out",
              // 🔴 THE STRIP ONLY GETS A SURFACE WHILE IT IS BEING READ. Collapsed it is bare
              // marks on the sheet — "nearly disappear until needed".
              peeking
                ? "bg-(--ui-bg-elevated)/95 px-2 shadow-lg ring-1 ring-(--ui-stroke-secondary) backdrop-blur-sm"
                : "px-0",
            )}
          >
            <RailMarker
              active={live}
              label="Now"
              onSelect={() => onSelect(null)}
              peeking={peeking}
            />
            {shown.map((entry) => (
              <RailMarker
                active={entry.momentId === activeMomentId}
                key={entry.id}
                label={shortTitle(entry.title, TITLE_LIMIT)}
                onSelect={() => onSelect(entry.momentId)}
                peeking={peeking}
              />
            ))}
            {/* 🔴 THE EXPLICIT AFFORDANCE, AND IT ONLY EXISTS WHILE THE RAIL IS BEING READ. A
                permanent "History" word on the edge would be chrome; a marker column that opens a
                drawer when you click a marker and nothing when you click between them would be a
                guess. This is the stated door. */}
            <button
              className={cn(
                "mt-1 overflow-hidden text-right text-[length:var(--canvas-text-meta)] text-(--ui-text-tertiary) transition-all duration-200 hover:text-(--ui-text-primary) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--ui-stroke-primary)",
                peeking ? "h-5 w-auto opacity-100" : "pointer-events-none h-0 w-0 opacity-0",
              )}
              onClick={() => setDisplay("expanded")}
              type="button"
            >
              All history
            </button>
          </nav>
        </div>
      </div>

      {/* ── mobile: a button, not an edge ─────────────────────────────────────────────────── */}
      <button
        aria-label="Canvas history"
        className={cn(
          "absolute right-3 top-1/2 z-30 -translate-y-1/2 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-bg-elevated)/90 px-2.5 py-1.5 text-[length:var(--canvas-text-meta)] text-(--ui-text-secondary) shadow-sm backdrop-blur-sm md:hidden",
          expanded && "opacity-0",
        )}
        onClick={() => setDisplay("expanded")}
        type="button"
      >
        History
      </button>

      <CanvasHistoryDrawer
        activeMomentId={activeMomentId}
        entries={entries}
        nowSubtitle={nowSubtitle}
        onClose={() => setDisplay("collapsed")}
        onSelect={(momentId) => {
          onSelect(momentId);
          setDisplay("collapsed");
        }}
        open={expanded}
      />
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
      className="group flex items-center justify-end gap-2 focus-visible:outline-none"
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
