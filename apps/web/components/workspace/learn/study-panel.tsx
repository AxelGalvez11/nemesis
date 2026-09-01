"use client";

// The right-hand panel a deck or a check opens into, beside the conversation that made it.
//
// 🔴🔴 FLASHCARDS AND TESTS USED TO SEIZE THE WHOLE SCREEN, AND THE OWNER REVERSED THAT ON
// 2026-08-30: *"the tests and the flashcards could appear in the sidebar… because that way, users
// could ask questions as well, have the chat on the side, and they could also full screen if they
// want."* And on the shape of it: *"you get an inline artifact component that you can click on to
// open the sidebar… to either go full screen or ask for changes."*
//
// 🔴 THIS OVERTURNS AN EARLIER ORDER, ON PURPOSE. `artifact-chrome.test.ts` used to pin the
// opposite rule, quoting the owner in August: *"Except for flashcards… full screen just like an
// Anki with an x on it."* Full screen is still HERE — it is the second button in this header — but
// it is now a door rather than the only way in. The argument that changed it: a test that owns the
// screen scrolls its own questions away the moment you want to discuss the result, so the thing you
// are asking about is the thing you can no longer see.
//
// 🔴🔴 A THIRD SHELL, NOT A THIRD SET OF NUMBERS. `OutputPreview` and `SourcePreview` are both
// hand-rolled panels that import their geometry from `reader-chrome.ts`; this is the third, and it
// imports the same module for the same reason. What it is NOT is a mode inside `OutputPreview` —
// that component is a document reader with a comment layer, a download button and a revise path,
// and a deck has none of those. Two objects that merely share a rectangle should not share a
// component; they should share the rectangle's measurements, which is what CHROME is.
//
// 🔴🔴 CLOSED MEANS HIDDEN, NOT UNMOUNTED, AND THAT IS A CORRECTNESS RULE RATHER THAN A
// PERFORMANCE ONE. A learner four questions into a check who closes the panel to re-read something
// must find those four answers still there when they reopen it. Unmounting would silently discard
// them, and a test that resets itself is worse than one that cannot be closed. `display: none` is
// set inline because a Tailwind `hidden` class and this element's `flex` class have the same
// specificity, so which one wins would depend on stylesheet order.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { Codicon } from "@/components/desktop-ui/codicon";
import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";
import { cn } from "@/lib/utils";

import { CHROME } from "./reader-chrome";
import { useDockWidth } from "./use-dock-width";

export function StudyPanel({
  children,
  crumb = "Study",
  initialMode = "docked",
  onClose,
  open,
  title,
}: {
  children: React.ReactNode;
  /** The muted first half of the header path. */
  crumb?: string;
  /**
   * 🔴🔴 THE DOOR DECIDES, AND BOTH OWNER RULINGS ARE SATISFIED BY THAT ONE WORD. On 2026-08-31 he
   * reported the opposite of today: *"the flashcard open full screen, and it did not open in the
   * sidebar, like the test. I thought I already asked for that."* On 2026-09-01, of the Library:
   * *"when I click on the flashcards it just pulls up a sidebar, which is not how it's supposed to
   * be in the library — for the library it should just be full screen immediately."*
   *
   * Those are not a contradiction, they are a scope. Docked exists to keep something ELSE on
   * screen: inside a canvas, the conversation the deck came out of. The Library shelf is not a
   * conversation — docking there squeezes a list of file names beside the thing you opened, which
   * is the one arrangement that helps nobody. So the caller says which it is, and the two doors
   * stop disagreeing about the same object.
   *
   * Full screen is still one button away from docked, and docked one button away from full: this
   * only decides where you land.
   */
  initialMode?: "docked" | "full";
  onClose: () => void;
  /** False keeps the children mounted and takes the panel off screen. */
  open: boolean;
  title: string;
}) {
  const [mode, setMode] = useState<"docked" | "full">(initialMode);
  // 🔴 THE `study` SLOT, NOT THE READER'S. Same hook and same drag; a different remembered width,
  // because a card is not a document. See the note on DOCK_SLOTS — this was measured on screen.
  const { dragging, onDragStart, width: dock } = useDockWidth("study");
  const full = mode === "full";

  // Push the surface by exactly the docked width; claim nothing while full screen (it covers
  // everything) or while closed (there is nothing beside the canvas).
  useDeclareSidePanel(open && !full ? dock : 0, dragging);

  // Escape closes, same as every transient surface on the canvas. Only while open, or a closed
  // panel would eat the key from whatever is actually on screen.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  // 🔴 PORTALLED TO THE BODY, AND WITHOUT IT THE PANEL COLLAPSES INTO A CORNER. `position: fixed`
  // resolves against the viewport only while no ancestor carries a transform — the canvas animates,
  // so `right-0` would otherwise mean "the right edge of the pushed canvas". `output-preview.tsx`
  // records finding this on screen; it is not visible in a diff.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!host) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-y-0 right-0 z-50 flex flex-col bg-(--ui-bg-elevated)",
        full ? "left-0" : "border-l border-(--ui-stroke-tertiary)",
        // 🔴🔴 UNCONDITIONAL, AND IT USED TO BE `!dragging &&` — WHICH REPLAYED THE ENTRANCE ON
        // EVERY RESIZE. Owner, 2026-09-01: *"there also seems to be flickering."* Removing a class
        // and putting it back is how you restart a CSS animation, so releasing the drag handle made
        // the panel jump to `translateX(4%)` at opacity 0 and slide in again. Watched live on
        // /dev-preview/exports: the class went true → false on pointerdown → true on pointerup.
        // The gate was guarding against nothing: this keyframe moves `transform` and `opacity`, not
        // width, and it has finished long before anybody can reach the handle.
        "reader-dock-in",
      )}
      // 🔴 THE STAMP TRAVELS WITH THE PORTAL, OR EVERY BUTTON IN HERE GOES ACID GREEN. `globals.css`
      // gives `button:where(:not([data-workspace] *))` a marketing fill, and moving this subtree to
      // `document.body` takes it out of the workspace scope.
      data-workspace
      data-testid="study-panel"
      role="dialog"
      style={{ display: open ? undefined : "none", width: full ? undefined : dock }}
    >
      {!full && (
        <div
          aria-label="Resize the panel"
          className="absolute inset-y-0 -left-[3px] z-10 w-[6px] cursor-col-resize bg-transparent transition-colors hover:bg-(--ui-action)/40"
          onPointerDown={onDragStart}
          role="separator"
        />
      )}
      <div className={CHROME.header}>
        {/* Full screen puts the close on the left beside the crumb, docked puts it on the right —
            the reference's own arrangement, and the same rule `output-preview.tsx` follows. */}
        {full && (
          <button aria-label="Close" className={CHROME.button} onClick={onClose} title="Close" type="button">
            <Codicon name="close" size={CHROME.icon} />
          </button>
        )}
        <span className={cn(CHROME.crumb, "min-w-0 flex-1")} title={title}>
          <span className="text-(--ui-text-quaternary)">{crumb}&nbsp;/&nbsp;</span>
          {title}
        </span>
        <button
          aria-label={full ? "Exit full screen" : "Full screen"}
          className={CHROME.button}
          data-testid="study-panel-full"
          onClick={() => setMode(full ? "docked" : "full")}
          title={full ? "Exit full screen" : "Full screen"}
          type="button"
        >
          <Codicon name={full ? "screen-normal" : "screen-full"} size={CHROME.icon} />
        </button>
        {!full && (
          <button aria-label="Close" className={CHROME.button} data-testid="study-panel-close" onClick={onClose} title="Close" type="button">
            <Codicon name="close" size={CHROME.icon} />
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>,
    host,
  );
}
