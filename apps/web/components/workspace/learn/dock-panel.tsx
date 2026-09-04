"use client";

// The one frame every panel beside the conversation wears: documents, the things Nemesis made,
// flashcards and tests.
//
// 🔴🔴 GEMINI'S PANEL WITH CHATGPT WORK'S TOP ROW, BY OWNER INSTRUCTION, 2026-09-04. He sent both:
// Gemini's canvas (*"it has the rounded corners for the side panel … this is kind of how I want to
// envision the chat to be, where you have like the chat on the left side and you have the right
// panel on the right side where you can view like documents and, you know, annotate"*), and two
// screenshots of ChatGPT's Work pane (*"i dont want the top bar or the outline comments … i want
// the multiple tabs too with the annotation/comment feature"*). So:
//
//   · the BODY is Gemini's: a rounded panel floating beside the conversation, 24px from the
//     window's edges, a 40px corner, a hairline edge, no shadow, scaling in from its centre
//     (`DOCK_*` in reader-chrome.ts holds the measurements and where they came from);
//   · the TOP ROW is ChatGPT's: the open things as tabs on the left, the controls on the right,
//     and nothing else. No name bar under the tabs (the tab is the name), no outline rail, no
//     comments rail; comments live on the document as pins.
//
// 🔴🔴 ONE COMPONENT, THREE CALLERS, BECAUSE THREE COPIES WAS HOW THEY DRIFTED. `source-preview`,
// `output-preview` and `study-panel` each carried their own portal, their own `fixed inset-y-0
// right-0` shell, their own grip and their own two rows of chrome, and `artifact-chrome.test.ts`
// existed largely to keep the three from disagreeing. They cannot disagree about what they do not
// own. What each still owns is what it puts IN the row and IN the body.
//
// 🔴 THREE SIZES, UNCHANGED (reader-chrome.ts, `ReaderMode`): docked is the floating panel; full
// is everything but the rail, flush, for reading a thing whole; maximized is the whole window. The
// rounded frame is the docked one's. A panel that fills the window has no edge to round.
//
// 🔴 THE PORTAL CARRIES `data-workspace`, OR EVERY BUTTON IN IT GOES ACID GREEN. `globals.css` has
// `button:where(:not([data-workspace] *)) { background: var(--acid) }`, so a subtree moved to
// `document.body` leaves the workspace scope. Found on screen the first time a panel portalled.

import { useEffect, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

import { CHROME, DOCK_MARGIN, DOCK_RADIUS, type ReaderMode } from "./reader-chrome";

export function DockPanel({
  children,
  controls,
  dragging = false,
  hidden = false,
  label,
  mode,
  onDragStart,
  tabs,
  testId,
  width,
}: {
  /** The body: the document, the artifact, the deck. Fills the frame under the row. */
  children: ReactNode;
  /** The right end of the row: the caller's controls, close last. */
  controls?: ReactNode;
  /** True while the grip is held: the frame drops its transition so the edge tracks the pointer. */
  dragging?: boolean;
  /**
   * Kept mounted but off screen. The study panel holds a deck's state across close and reopen
   * (study-panel.tsx), so it hides rather than unmounts; `display: none` also restarts the
   * arrival when it comes back, which is the right thing for a panel that is being opened again.
   */
  hidden?: boolean;
  /** What the dialog is called for a screen reader: the front tab's name. */
  label: string;
  mode: ReaderMode;
  onDragStart?: (event: PointerEvent) => void;
  /** The left end of the row: the strip of open things. */
  tabs?: ReactNode;
  testId?: string;
  /** The panel's own width while docked, from `useDockWidth`. Ignored at the other two sizes. */
  width: number;
}) {
  // 🔴 `document.body` IS READ AFTER MOUNT, never during render: the server has no document, and
  // a portal target that differs between the two makes React discard the tree.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!host) return null;

  const docked = mode === "docked";
  return createPortal(
    <div
      aria-label={label}
      className={cn(
        "fixed z-50 flex flex-col bg-(--ui-bg-elevated)",
        docked
          ? // 🔴 `overflow-hidden` IS WHAT ROUNDS THE DOCUMENT'S CORNERS, not only the frame's. A
            // page scrolled to its foot would otherwise paint square over the curve.
            // 🔴 `dock-panel-in` runs once, when the element is created (globals.css). Never
            // conditional on `dragging`: taking a class off and putting it back is how a CSS
            // animation is restarted, and a panel that replays its entrance on every release of the
            // grip is the flicker the owner reported on 2026-09-01.
            "dock-panel-in overflow-hidden border border-(--ui-stroke-tertiary)"
          : mode === "maximized"
            ? "inset-0 z-[60]"
            : "inset-y-0 right-0 left-[var(--nav-column,0px)]",
      )}
      data-dock-mode={mode}
      data-testid={testId}
      data-workspace
      role="dialog"
      style={{
        display: hidden ? "none" : undefined,
        ...(docked
          ? {
              borderRadius: DOCK_RADIUS,
              bottom: DOCK_MARGIN,
              right: DOCK_MARGIN,
              top: DOCK_MARGIN,
              // The width follows the pointer exactly while the grip is held; the conversation's
              // edge is told the same (`useSidePanelLive`), so the seam never opens.
              transition: dragging ? "none" : undefined,
              width,
            }
          : null),
      }}
    >
      {/* 🔴 THE GRIP IS ON THE LEFT EDGE, WHICH IS THE EDGE THAT MOVES. 6px wide with a wider
          invisible target either side, `col-resize`, no paint until hover. Only while docked: a
          panel filling the window has no edge to drag. */}
      {docked && onDragStart && (
        <div
          aria-label="Resize the panel"
          className="absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize bg-transparent transition-colors hover:bg-(--ui-action)/40"
          onPointerDown={onDragStart}
          role="separator"
        />
      )}

      {/* 🔴 THE ROW. Tabs left, controls right, and the row is the only chrome. `CHROME.row` says
          why it is 44px and why it starts 20px in. */}
      <div className={CHROME.row} data-testid="dock-panel-row">
        <div className="flex min-w-0 flex-1 items-center">{tabs}</div>
        <div className="flex shrink-0 items-center gap-[4px]">{controls}</div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>,
    host,
  );
}
