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

import { useEffect, useState, type ReactNode } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { useDeclareSidePanel } from "@/components/workspace/shell/side-panel";
import { cn } from "@/lib/utils";

import { ReaderAsk, ASK_CLEARANCE } from "./reader-ask";
import { DockPanel } from "./dock-panel";
import { DockTabs } from "./dock-tabs";
import type { DockItem } from "./document-dock";
import { biggerThan, CHROME, type ReaderMode } from "./reader-chrome";
import { useDockWidth } from "./use-dock-width";

export function StudyPanel({
  actions,
  activeKey = null,
  children,
  crumb = "Study",
  initialMode = "docked",
  items,
  onAsk,
  onClose,
  onCloseKey,
  onSelectKey,
  open,
  title,
  widthSlot = "study",
}: {
  /**
   * The one pane's tabs, when this panel is a body of it.
   *
   * 🔴🔴 THE SAME STRIP THE READER DRAWS, from the same component, so a deck, a check or a map is
   * a tab beside the lectures rather than a second rectangle over them (owner 2026-09-03: *"one
   * side panel that's supposed to render anything... multiple tab views"*). Absent on the Library,
   * which mounts this panel on its own with nothing to tab between.
   */
  items?: readonly DockItem[];
  activeKey?: string | null;
  onSelectKey?: (key: string) => void;
  onCloseKey?: (key: string) => void;
  /**
   * Which remembered width to open at: the study card's own, or the reader's.
   *
   * 🔴 A TAB OF THE ONE PANE USES THE READER'S WIDTH, or switching from a lecture to a deck would
   * jump the pane between two widths. The Library's standalone deck keeps the study width.
   */
  widthSlot?: "study" | "reader";
  /**
   * Header controls this panel's contents supply, drawn left of the size toggle.
   *
   * 🔴🔴 THE OWNER ASKED FOR THE DOCUMENT'S TOOLBAR ON EVERY ARTIFACT (2026-09-03): *"it doesn't
   * have the same toolbar… it should be the same, basically the one it has for the document."* The
   * document reader draws Download, Full screen, Close in that order, so a deck's Download belongs
   * HERE rather than in a second header of its own — same slot, same 40px pitch, same order.
   *
   * 🔴 A DECK GETS NO COMMENT BUTTON, AND THAT IS THE ONE DELIBERATE DIFFERENCE. The document's
   * comment mode pins a bubble to a paragraph it registered as a unit; a card has no such units and
   * nothing to annotate. Drawing the control anyway would be a dead one, which is the thing
   * `capabilities-are-live.test.ts` exists to stop.
   */
  actions?: ReactNode;
  children: ReactNode;
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
  /**
   * Ask a question about what is open, in a new conversation. Absent draws no bar.
   *
   * 🔴 THE LIBRARY ONLY, exactly as the document reader has it. Docked beside a canvas the bar
   * would be the second composer on screen, with the wrong one nearer.
   */
  onAsk?: (question: string) => void;
  onClose: () => void;
  /** False keeps the children mounted and takes the panel off screen. */
  open: boolean;
  title: string;
}) {
  /**
   * 🔴🔴 THREE SIZES SINCE 2026-09-03, AND HAVING ONLY TWO WAS THE DEFECT. Owner, of a deck opened
   * from the Library: *"it opens full screen and when you undo the full screen it kind of does
   * this, which is different than the documents one."* Both artifacts open `full` there, and the
   * same-looking button then stepped the document UP to `maximized` and this panel DOWN to a narrow
   * sidebar laid over a shelf of file names. The step is shared now — see `reader-chrome.ts`.
   */
  const [mode, setMode] = useState<ReaderMode>(initialMode);
  // 🔴 THE `study` SLOT, NOT THE READER'S. Same hook and same drag; a different remembered width,
  // because a card is not a document. See the note on DOCK_SLOTS — this was measured on screen.
  const { column, dragging, onDragStart, width: dock } = useDockWidth(widthSlot);
  /** Anything that is not the side sheet. */
  const full = mode === "full" || mode === "maximized";
  // Push the surface by the panel's column (panel, gap and margin — use-dock-width.ts); claim
  // nothing while full screen (it covers everything) or while closed (there is nothing beside the
  // canvas). `full` deliberately stops at `--nav-column` so Library, Projects and the rest stay
  // reachable while a deck is open — the owner's own description of the reference: *"you keep the
  // left sidebar and it just leaves the sidebar open."* `DockPanel` draws that.
  useDeclareSidePanel(open && !full ? column : 0, dragging);

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

  // 🔴 THE FRAME IS `DockPanel`'S — the portal, the rounded floating panel, the grip and the one
  // row of tabs-and-controls. This panel decides what is in the row: its tabs (or its name when it
  // opened on its own from the Library), the caller's actions, the size toggle, close.
  return (
    <DockPanel
      controls={
        <>
          {actions}
          <button
            aria-label={mode === initialMode ? "Full screen" : "Exit full screen"}
            className={CHROME.button}
            data-testid="study-panel-full"
            // 🔴 AGAINST WHERE IT OPENED, NOT A FIXED PAIR — the same rule the document reader
            // follows. From a canvas (`docked`) the step up is `full`; from the Library (`full`) it
            // is `maximized`. One press out, one press back, and the Library can never reach the
            // side sheet, which is the arrangement the owner reported as wrong.
            onClick={() => setMode(mode === initialMode ? biggerThan(initialMode) : initialMode)}
            title={mode === initialMode ? "Full screen" : "Exit full screen"}
            type="button"
          >
            <Codicon name={mode === initialMode ? "screen-full" : "screen-normal"} size={CHROME.icon} />
          </button>
          <button aria-label="Close" className={CHROME.button} data-testid="study-panel-close" onClick={onClose} title="Close" type="button">
            <Codicon name="close" size={CHROME.icon} />
          </button>
        </>
      }
      dragging={dragging}
      hidden={!open}
      label={title}
      mode={mode}
      onDragStart={onDragStart}
      tabs={
        items && items.length > 0 && onSelectKey && onCloseKey ? (
          <DockTabs activeKey={activeKey} items={items} onClose={onCloseKey} onSelect={onSelectKey} />
        ) : (
          <span className={cn(CHROME.crumb, "min-w-0 flex-1 pl-[6px]")} title={title}>
            <span className="text-(--ui-text-quaternary)">{crumb}&nbsp;/&nbsp;</span>
            {title}
          </span>
        )
      }
      testId="study-panel"
      width={dock}
    >
      <div className={cn("h-full min-h-0 overflow-auto", full && onAsk && ASK_CLEARANCE)}>{children}</div>
      {/* 🔴 THE SAME BAR THE DOCUMENT READER DRAWS, from the same module — see `reader-ask.tsx`.
          Typing in it cannot grade a card: `review-session.tsx` scopes its Space and 1-4 hotkeys to
          its own subtree while `bare`, and this sits outside it. */}
      {full && onAsk && <ReaderAsk label={title} onAsk={onAsk} />}
    </DockPanel>
  );
}
