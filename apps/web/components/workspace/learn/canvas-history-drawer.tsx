"use client";

// The history drawer: everything that happened on this Canvas, as a list you navigate.
//
// 🔴 IT OVERLAYS AND DOES NOT REFLOW. Owner: *"NOT resize/reflow the main Canvas."* So it is
// absolutely positioned over the sheet rather than taking part in its layout — a drawer that
// pushed the reading column sideways would re-wrap every line of the answer behind it, which is
// the single most distracting thing a navigation panel can do to a page someone is reading.
//
// 🔴 NO FULL-SCREEN SCRIM. Owner: *"No full-screen dark modal backdrop. A subtle shadow/border is
// enough."* Dimming the Canvas would say "you have left what you were doing", and opening the
// history is not leaving it. The click-outside close is a transparent catcher, not a visible one.
//
// 🔴 NOT VIRTUALIZED, ON PURPOSE. The brief asks for virtualization "if it becomes very long", and
// `MAX_MOMENTS` caps a canvas at 80 moments plus the synthesised origin row — 81 buttons, which is
// nothing to render and cheaper than the machinery to avoid rendering it. If that cap ever rises,
// this is the comment that says what to do about it.

import { useEffect, useRef } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { cn } from "@/lib/utils";

import type { CanvasHistoryEntry } from "@/lib/learn/canvas-history";

import { CanvasHistoryRow } from "./canvas-history-entry";

export function CanvasHistoryDrawer({
  activeMomentId,
  entries,
  nowSubtitle,
  onClose,
  onSelect,
  open,
}: {
  /** The moment being viewed, or null while the Canvas is showing the present. */
  activeMomentId: string | null;
  /** Oldest first, as `buildCanvasHistory` returns them. Reversed for reading here. */
  entries: readonly CanvasHistoryEntry[];
  /** What "Now" currently is — the live subject line under the top row. */
  nowSubtitle?: string;
  onClose: () => void;
  /** null selects the present. */
  onSelect: (momentId: string | null) => void;
  open: boolean;
}) {
  const panel = useRef<HTMLDivElement | null>(null);

  // 🔴 ESCAPE AND CLICK-OUTSIDE ARE BOUND ONLY WHILE OPEN. A listener that lives for the life of
  // the Canvas and returns early is a listener on every keystroke the composer receives.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 🔴 THE DRAWER TAKES THE ESCAPE ONLY WHEN IT IS THE THING ON TOP. Stopping propagation
      // keeps one press from also closing whatever is behind it — the surface's own exit included.
      event.stopPropagation();
      onClose();
    };
    const onDown = (event: MouseEvent) => {
      if (panel.current?.contains(event.target as Node)) return;
      onClose();
    };
    // Capture, so a click on a Canvas control closes the drawer before that control acts on it.
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [onClose, open]);

  const reading = [...entries].reverse();

  return (
    // 🔴🔴 THE CLIPPING WRAPPER, AND WITHOUT IT THE CLOSED DRAWER IS A HORIZONTAL SCROLLBAR.
    // Measured in Chromium before this existed: `documentElement.scrollWidth - innerWidth` was
    // **396** at 1280×800 and **306** at 360×720, on a Canvas with the drawer SHUT — because
    // `translate-x-full` parks a 360px panel just past the right edge, and a transform still
    // contributes to scrollable overflow. It read as a page that could be dragged sideways into
    // nothing. `overflow-hidden` on a wrapper pinned to the sheet is what makes the parked
    // position unreachable; `hidden`-when-closed would have killed the slide-in instead.
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
    <div
      aria-hidden={!open}
      aria-label="Canvas history"
      className={cn(
        // 🔴 `translate-x-full` RATHER THAN A WIDTH ANIMATION. Animating width reflows the
        // drawer's own contents on every frame; a transform is composited and does not.
        "absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col",
        "border-l border-(--ui-stroke-secondary) bg-(--ui-bg-elevated) shadow-xl",
        "transition-transform duration-200 ease-out motion-reduce:transition-none",
        // 🔴 `pointer-events-auto` BECAUSE THE CLIPPING WRAPPER TURNED THEM OFF. Without it the
        // drawer paints and cannot be clicked, which is the worst of both.
        open ? "pointer-events-auto translate-x-0" : "pointer-events-none translate-x-full",
      )}
      ref={panel}
      role="dialog"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <span className="text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">History</span>
        <button
          aria-label="Close history"
          className="flex size-7 items-center justify-center rounded-md text-(--ui-text-tertiary) transition-colors duration-150 hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary) focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--ui-stroke-primary)"
          onClick={onClose}
          type="button"
        >
          <Codicon name="chevron-right" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3">
        {/* 🔴 "NOW" IS A ROW, NOT A BUTTON THAT DOES NOTHING WHEN YOU ARE ALREADY THERE. It is the
            same control as `Return to now` on the banner, reached from the place a learner is
            already looking. Rendered first because the brief's own sketch does. */}
        <CanvasHistoryRow
          active={activeMomentId === null}
          entry={{
            createdAt: new Date().toISOString(),
            id: "now",
            momentId: "now",
            title: "Now",
            type: "milestone",
            ...(nowSubtitle ? { preview: nowSubtitle } : {}),
          }}
          onSelect={() => onSelect(null)}
        />
        {reading.map((entry) => (
          <CanvasHistoryRow
            active={entry.momentId === activeMomentId}
            entry={entry}
            key={entry.id}
            onSelect={() => onSelect(entry.momentId)}
          />
        ))}
      </div>
    </div>
    </div>
  );
}
