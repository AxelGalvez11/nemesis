"use client";

// Everything that happened on this Canvas, as a floating card beside the rail.
//
// 🔴🔴 A CARD, NOT A SIDEBAR, AND THE FIRST VERSION OF THIS WAS THE SIDEBAR. Owner, 2026-08-23,
// with a screenshot: *"it needs to be like this, not a full sidebar"*. What shipped first was a
// full-height panel pinned to the right edge with a "History" header and a close chevron — which
// is a navigation surface announcing itself as a place you have gone to. The card is the opposite
// claim: a short list that appears next to what you were already looking at, and goes away.
//
// So there is no header, no title, no close control, and no full-height edge. What is left is the
// rows, which are the only thing a learner came here for.
//
// 🔴 IT STILL OVERLAYS AND STILL DOES NOT REFLOW. That part of the brief did not change: a panel
// that pushed the reading column sideways would re-wrap every line of the answer behind it.
//
// 🔴 NO SCRIM, AND NOW NOT EVEN A BORDER-AND-SHADOW WALL. Owner: "A subtle shadow/border is
// enough." A card gets a soft shadow and a hairline ring; nothing dims the Canvas, because opening
// the history is not leaving it.

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

import type { CanvasHistoryEntry } from "@/lib/learn/canvas-history";

import { CanvasHistoryRow } from "./canvas-history-entry";

export function CanvasHistoryPanel({
  activeMomentId,
  entries,
  onClose,
  onSelect,
  open,
}: {
  /** The moment being viewed, or null while the Canvas is showing the present. */
  activeMomentId: string | null;
  /**
   * Oldest first, exactly as `buildCanvasHistory` returns them.
   *
   * 🔴 NOT REVERSED. The owner's screenshot reads top to bottom as the session ran — the first
   * thing asked at the top, the most recent at the bottom, "Now" last. The first version put Now
   * at the top and ran backwards, which is how a chat sidebar is ordered and reads as a list of
   * documents rather than as a path through an afternoon.
   */
  entries: readonly CanvasHistoryEntry[];
  onClose: () => void;
  /** null selects the present. */
  onSelect: (momentId: string | null) => void;
  open: boolean;
}) {
  const panel = useRef<HTMLDivElement | null>(null);

  // 🔴 BOUND ONLY WHILE OPEN. A listener that lives for the life of the Canvas and returns early
  // is a listener on every keystroke the composer receives.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 🔴 THE CARD TAKES THE ESCAPE ONLY WHILE IT IS THE THING ON TOP, so one press does not also
      // close the surface behind it.
      event.stopPropagation();
      onClose();
    };
    const onDown = (event: MouseEvent) => {
      if (panel.current?.contains(event.target as Node)) return;
      onClose();
    };
    // Capture, so a click on a Canvas control closes the card before that control acts on it.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [onClose, open]);

  return (
    <div
      aria-hidden={!open}
      aria-label="Canvas history"
      className={cn(
        // 🔴 ANCHORED BESIDE THE RAIL, NOT TO THE EDGE. `right-9` clears the 27px marker column so
        // the card sits next to the marks it belongs to, which is what makes it read as the rail
        // opening rather than as a panel arriving from off-screen.
        "absolute right-9 top-1/2 z-40 -translate-y-1/2",
        "flex max-h-[min(30rem,72vh)] w-[min(20rem,calc(100vw-4.5rem))] flex-col overflow-y-auto",
        "rounded-2xl bg-(--ui-bg-elevated) p-1.5 shadow-xl ring-1 ring-(--ui-stroke-secondary)",
        // 🔴 SCALE AND FADE, NOT A SLIDE. A card belongs to the thing it opened from; sliding it in
        // from the edge is the sidebar gesture this replaced.
        "origin-right transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
        open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
      )}
      ref={panel}
      role="dialog"
    >
      {entries.map((entry) => (
        <CanvasHistoryRow
          active={entry.momentId === activeMomentId}
          entry={entry}
          key={entry.id}
          onSelect={() => onSelect(entry.momentId)}
        />
      ))}
      {/* 🔴 "NOW" IS LAST, AND IT IS A ROW LIKE ANY OTHER. It is the same control as `Return to
          now` on the rewind banner, reached from the place the learner is already looking. */}
      <CanvasHistoryRow
        active={activeMomentId === null}
        entry={{ createdAt: "", id: "now", momentId: "now", title: "Now", type: "milestone" }}
        onSelect={() => onSelect(null)}
      />
    </div>
  );
}
