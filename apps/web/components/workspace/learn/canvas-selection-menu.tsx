"use client";

// The fast path: point at the confusing thing, say what you want, get it.
//
// The alternative — copy the phrase, find the composer, type a question about it — costs enough
// that most learners simply carry the confusion forward. §28: this toolbar is the shortcut, and
// the persistent composer stays for anything broader.
//
// 🔴🔴 IT IS AN ASK BOX NOW, NOT A MENU OF FIVE VERBS. Owner, 2026-08-21: *"remove the 'define,
// explain, simpler, example, why?' and replace with the 'ask nemesis'."* The five buttons were five
// guesses at what somebody might want, chosen by us in advance, and a learner whose question was
// not one of the five had to abandon the highlight and describe where they had been looking. They
// were also each hard-wired to one of only two outcomes — four could only ever answer, "Simpler"
// could only ever rewrite — which is the same shape `learning-intent.ts` was deleted for at the
// front door: code deciding what a sentence means before a model has read it.
//
// What the learner types goes to `askSelection`, and the MODEL decides whether it means "tell me"
// or "change this". So "what does this mean" answers beside the passage, "say this more simply"
// rewrites it, and "add an example here" grows it — with nothing in this file reading any of them.
//
// 🔴 "Speak" IS NOT ONE OF THE DELETED FIVE AND STAYS. Reading the highlighted words aloud is a
// direct action on the text, not a guess at an intent: there is no sentence to interpret, and no
// second thing it could have meant.
//
// 🔴 NO ⌘K HINT, THOUGH THE REFERENCE HAS ONE. This app already binds ⌘K to Search chats
// (AppShell.tsx). Printing a shortcut on a control that opens something else would be a lie, and
// a lie the learner discovers by pressing it.
//
// 🔴 PLACEMENT IS THE BUG FAMILY ON THIS SURFACE. The composer's scrim owns the bottom of the
// page and the title scrim owns the top 88px, both of which will happily paint over a menu
// positioned naively. It flips above/below by available room and is verified with
// `elementFromPoint` on its own centre, because "visible in a screenshot" and "actually on top"
// are different claims.

import { useEffect, useRef, useState } from "react";

import { Codicon } from "@/components/desktop-ui/codicon";
import { selectionShape, type CanvasSelection } from "@/lib/learn/canvas-selection";

/** Clearance for the title scrim at the top and the composer pill at the bottom.
 *
 *  🔴 EXPORTED SO OTHER FLOATING SURFACES REUSE THIS BAND RATHER THAN RE-GUESSING IT. Every
 *  popover on this page shares the same title scrim and the same composer pill, so there is
 *  exactly one correct answer for how much clearance either edge needs — see
 *  `canvas-document.tsx`'s citation popover, which clamps into this same band instead of
 *  carrying its own copy of these two numbers. */
export const TOP_KEEPOUT = 96;
export const BOTTOM_KEEPOUT = 104;
const MENU_WIDTH = 300;

export interface SelectionAnswer {
  term: string;
  text: string;
  /** Set when the answer came from the learner's own material rather than general knowledge. */
  sourceLabel?: string;
}

/** What the learner is pointing at, said back to them above the box they type in. Structural —
 *  word, phrase or passage — so it reads the same for a statute and a stress-strain curve. */
function askPlaceholder(selection: CanvasSelection): string {
  switch (selectionShape(selection.selectedText)) {
    case "word":
      return "Ask about this word";
    case "phrase":
      return "Ask about this phrase";
    default:
      return "Ask about this passage";
  }
}

interface CanvasSelectionMenuProps {
  selection: CanvasSelection;
  rect: { top: number; bottom: number; left: number; right: number };
  /** Non-null once a request has produced something. */
  answer: SelectionAnswer | null;
  busy: boolean;
  error: string | null;
  /** The learner clicked a marked vocabulary word rather than highlighting text.
   *
   *  🔴 That click already asked its question, so the toolbar must never appear for it. Falling
   *  back to an empty ask box while the definition is still loading reads as a broken control:
   *  they asked what a word means and got a box asking them what they want. */
  forceOpen?: boolean;
  /**
   * What the learner typed. Never read here — see this file's header.
   *
   * The answer comes back through `answer`, and a null one means Nemesis rewrote the passage
   * instead, which the document itself shows.
   */
  onAsk: (request: string) => void;
  /**
   * Read the highlighted passage aloud, and read it again on a second press.
   *
   * 🔴 IT LIVES ON THE SELECTION AND NOT IN THE MENU OF SETTINGS, because the thing a learner
   * wants spoken is a thing they can point at. The routed voice reads questions and corrections
   * and refuses explanations — deliberately, so nobody is read a paragraph of prose every turn —
   * which left no way to hear a phrase, a foreign word, or a sentence again. Highlighting it is
   * the ask; this is the answer to it.
   */
  onSpeak?: (text: string) => void;
  /** True while something is being spoken, so the control can offer to stop instead. */
  speaking?: boolean;
  onDismiss: () => void;
}

export function CanvasSelectionMenu({
  selection,
  rect,
  answer,
  busy,
  error,
  forceOpen = false,
  onAsk,
  onSpeak,
  speaking = false,
  onDismiss,
}: CanvasSelectionMenuProps) {
  const open = Boolean(answer || busy || error || forceOpen);
  /** The ask box is showing, before anything has been asked. */
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement | null>(null);

  // A new selection is a new question. Without this the half-typed request about the last
  // paragraph is still sitting in the box over the next one.
  useEffect(() => {
    setAsking(false);
    setDraft("");
  }, [selection.regionId, selection.startOffset, selection.endOffset]);

  useEffect(() => {
    if (asking || open) input.current?.focus();
  }, [asking, open]);

  const submit = () => {
    const request = draft.trim();
    if (!request || busy) return;
    setDraft("");
    onAsk(request);
  };

  // An open popover is taller than a toolbar, so where it fits is a different question.
  const height = open ? 200 : asking ? 48 : 40;

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

  const width = open || asking ? MENU_WIDTH : undefined;
  const centred = (rect.left + rect.right) / 2 - (width ?? 150) / 2;
  const left = Math.max(12, Math.min(centred, window.innerWidth - (width ?? 150) - 12));

  /** The one control the learner types into, in both the toolbar and the open panel. */
  const askRow = (
    <div className="flex items-center gap-1.5 rounded-full bg-(--ui-bg-tertiary) py-1 pl-3 pr-1 ring-1 ring-(--ui-stroke-tertiary)">
      <input
        className="min-w-0 flex-1 bg-transparent text-[length:var(--canvas-text-small)] text-(--ui-text-primary) outline-none placeholder:text-(--ui-text-quaternary)"
        disabled={busy}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
          // Escape gives the page back rather than only closing the box: the learner is looking
          // at the paragraph, and a control that half-closes leaves them pressing it twice.
          if (event.key === "Escape") onDismiss();
        }}
        placeholder={answer ? "Ask a follow-up" : askPlaceholder(selection)}
        ref={input}
        value={draft}
      />
      <button
        aria-label="Ask Nemesis"
        className="shrink-0 rounded-full p-1.5 text-(--ui-text-tertiary) transition-colors hover:bg-(--ui-bg-elevated) hover:text-(--ui-text-primary) disabled:opacity-40"
        disabled={busy || !draft.trim()}
        onClick={submit}
        type="button"
      >
        <Codicon name="arrow-up" size="0.75rem" />
      </button>
    </div>
  );

  return (
    <div
      className="fixed z-40"
      data-canvas-selection-menu
      style={{ top: `${top}px`, left: `${left}px`, ...(width ? { width: `${width}px` } : {}) }}
    >
      {open ? (
        // 🔴 `canvas-swap` (contract rule 3, 2026-08-15) — the toolbar → open-panel transition is a
        // real mount (the ternary below swaps elements, not just content), so this plays once on
        // genuine appearance and does not re-fire while busy/error/answer succeed one another
        // inside the same open state. Same 140ms opacity fade the rest of the Canvas uses; see
        // canvas-document.tsx's aside for the sibling case.
        <div className="canvas-swap rounded-2xl bg-(--ui-bg-elevated) p-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[length:var(--canvas-text-small)] font-medium text-(--ui-text-primary)">
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
            <p className="mt-2 flex items-center gap-1.5 text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">
              <Codicon name="loading" size="0.75rem" spinning />
              Looking at this…
            </p>
          )}

          {error && !busy && <p className="mt-2 text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)">{error}</p>}

          {answer && !busy && (
            <>
              <p className="mt-2 text-[length:var(--canvas-text-small)] leading-relaxed text-(--ui-text-secondary)">{answer.text}</p>
              {/* Provenance where it exists, and silence where it does not — implying the
                  learner's own material said something it never said is worse than no citation. */}
              {answer.sourceLabel && (
                <p className="mt-2 text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">From {answer.sourceLabel}</p>
              )}
            </>
          )}

          {/* 🔴 THE BOX STAYS OPEN UNDERNEATH THE ANSWER, which is what replaces the old
              "Example" / "Go deeper" pair. Those were two more fixed guesses, and they were the
              two that most often were not what the learner wanted next. A follow-up is typed in
              the same place the first question was, about the same highlighted words. */}
          {!busy && <div className="mt-3">{askRow}</div>}
        </div>
      ) : asking ? (
        <div className="canvas-swap rounded-full bg-(--ui-bg-elevated) p-1 shadow-[0_4px_20px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)">
          {askRow}
        </div>
      ) : (
        <div className="flex items-center gap-0.5 rounded-full bg-(--ui-bg-elevated) p-1 shadow-[0_4px_20px_rgba(0,0,0,0.14)] ring-1 ring-(--ui-stroke-tertiary)">
          {onSpeak && (
            <>
              <button
                className="rounded-full px-3 py-1.5 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-bg-tertiary)"
                onClick={() => onSpeak(selection.selectedText)}
                type="button"
              >
                {/* Pressing it while it is talking is a REPEAT, not a stop: the passage restarts.
                    Somebody who did not catch a word presses again, and a control that went quiet
                    instead would be answering a question nobody asked. */}
                {speaking ? "Again" : "Speak"}
              </button>
              <span aria-hidden className="mx-0.5 h-4 w-px bg-(--ui-stroke-tertiary)" />
            </>
          )}
          <button
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[length:var(--canvas-text-small)] text-(--ui-text-primary) transition-colors hover:bg-(--ui-bg-tertiary)"
            onClick={() => setAsking(true)}
            type="button"
          >
            <Codicon name="sparkle" size="0.75rem" />
            Ask Nemesis
          </button>
        </div>
      )}
    </div>
  );
}
