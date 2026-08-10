"use client";

// The fast path: point at the confusing thing, get an answer next to it.
//
// The alternative — copy the phrase, find the composer, type a question about it — costs enough
// that most learners simply carry the confusion forward. §28: this toolbar is the shortcut, and
// the persistent composer stays for anything broader.
//
// A short answer stays in a popover here. It does NOT become a message, and it does NOT rewrite
// the paragraph: looking up one word must not disturb the thing being read. Only "Simpler" edits
// the page, and only the block it was invoked from.
//
// 🔴 PLACEMENT IS THE BUG FAMILY ON THIS SURFACE. The composer's scrim owns the bottom of the
// page and the title scrim owns the top 88px, both of which will happily paint over a menu
// positioned naively. It flips above/below by available room and is verified with
// `elementFromPoint` on its own centre, because "visible in a screenshot" and "actually on top"
// are different claims.

import { Codicon } from "@/components/desktop-ui/codicon";
import {
  selectionActions,
  selectionShape,
  type CanvasSelection,
  type SelectionAction,
} from "@/lib/learn/canvas-selection";
import { cn } from "@/lib/utils";

/** Clearance for the title scrim at the top and the composer pill at the bottom. */
const TOP_KEEPOUT = 96;
const BOTTOM_KEEPOUT = 104;
const MENU_WIDTH = 300;

export interface SelectionAnswer {
  term: string;
  text: string;
  /** Set when the answer came from the learner's own material rather than general knowledge. */
  sourceLabel?: string;
}

interface CanvasSelectionMenuProps {
  selection: CanvasSelection;
  rect: { top: number; bottom: number; left: number; right: number };
  /** Non-null once an action has produced something. */
  answer: SelectionAnswer | null;
  busy: boolean;
  error: string | null;
  onAct: (action: SelectionAction) => void;
  onDismiss: () => void;
}

export function CanvasSelectionMenu({
  selection,
  rect,
  answer,
  busy,
  error,
  onAct,
  onDismiss,
}: CanvasSelectionMenuProps) {
  const open = Boolean(answer || busy || error);
  const shape = selectionShape(selection.selectedText);
  const actions = selectionActions(shape, selection.rewritable);

  // An open popover is taller than a toolbar, so where it fits is a different question.
  const height = open ? 168 : 40;

  // 🔴 The safe band is computed FIRST and everything is clamped into it.
  //
  // The obvious version — "above if there is room above, else below" — puts the menu straight
  // through the composer for a selection near the bottom of the page: "above the selection" is
  // still inside the composer's territory when the selection itself is at y=757 of 775. Both
  // candidate positions have to be tested against the same band, and if neither fits, the band
  // wins. Verified with `elementFromPoint` on each button, because sitting at a legal
  // coordinate and actually being clickable are different claims.
  const bandTop = TOP_KEEPOUT;
  const bandBottom = window.innerHeight - BOTTOM_KEEPOUT;
  const fits = (candidate: number) => candidate >= bandTop && candidate + height <= bandBottom;

  const preferAbove = rect.top - height - 10;
  const preferBelow = rect.bottom + 10;
  const top = fits(preferAbove)
    ? preferAbove
    : fits(preferBelow)
      ? preferBelow
      : Math.max(bandTop, Math.min(preferAbove, bandBottom - height));

  const width = open ? MENU_WIDTH : undefined;
  const centred = (rect.left + rect.right) / 2 - (width ?? 150) / 2;
  const left = Math.max(12, Math.min(centred, window.innerWidth - (width ?? 150) - 12));

  return (
    <div
      className="fixed z-40"
      data-canvas-selection-menu
      style={{ top: `${top}px`, left: `${left}px`, ...(width ? { width: `${width}px` } : {}) }}
    >
      {open ? (
        <div className="rounded-2xl bg-(--ui-bg-elevated) p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[0.8125rem] font-medium text-(--ui-text-primary)">
              {answer?.term ?? selection.selectedText}
            </p>
            <button
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 shrink-0 text-(--ui-text-quaternary) hover:text-(--ui-text-primary)"
              onClick={onDismiss}
              type="button"
            >
              <Codicon name="close" size="0.6875rem" />
            </button>
          </div>

          {busy && (
            <p className="mt-2 flex items-center gap-1.5 text-[0.8125rem] text-(--ui-text-tertiary)">
              <Codicon name="loading" size="0.75rem" />
              Looking at this…
            </p>
          )}

          {error && !busy && <p className="mt-2 text-[0.8125rem] text-(--ui-text-tertiary)">{error}</p>}

          {answer && !busy && (
            <>
              <p className="mt-2 text-[0.875rem] leading-relaxed text-(--ui-text-secondary)">{answer.text}</p>
              {/* Provenance where it exists, and silence where it does not — implying the
                  learner's own material said something it never said is worse than no citation. */}
              {answer.sourceLabel && (
                <p className="mt-2 text-[0.6875rem] text-(--ui-text-quaternary)">From {answer.sourceLabel}</p>
              )}
              <div className="mt-3 flex items-center gap-3 text-[0.75rem]">
                <button
                  className="text-(--ui-text-tertiary) hover:text-(--ui-text-primary)"
                  onClick={() => onAct("example")}
                  type="button"
                >
                  Example
                </button>
                <button
                  className="text-(--ui-text-tertiary) hover:text-(--ui-text-primary)"
                  onClick={() => onAct("explain")}
                  type="button"
                >
                  Go deeper
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-0.5 rounded-full bg-(--ui-bg-elevated) p-1 shadow-[0_4px_20px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)">
          {actions.map((option, index) => (
            <button
              className={cn(
                "rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors hover:bg-(--ui-bg-tertiary)",
                index === 0 ? "text-(--ui-text-primary)" : "text-(--ui-text-secondary)",
              )}
              key={option.action}
              onClick={() => onAct(option.action)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
