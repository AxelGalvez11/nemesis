"use client";

// The keyboard, on a surface whose whole point is that the learner keeps their hands where they
// are (owner, 2026-08-19).
//
//     Hold Space   (nothing focused)    start dictating
//     Release Space                     stop, and put the transcription in the composer
//     Enter                             submit what is in the composer   [the composer's own]
//     ⌘/Ctrl + Enter                    Continue, when a Continue is available
//     Esc                               cancel dictation, or dismiss a temporary state
//
// 🔴 IT SUPPLEMENTS THE UI, IT DOES NOT REPLACE IT. Every one of these has a control on screen —
// the microphone button, the send button, the Continue button — and that is a requirement rather
// than a leftover: touch has no Space key, a screen reader user does not hold one, and a shortcut
// nobody can see is not a way to use a product. So this file adds no capability. It only removes
// the reach for the mouse for someone who has both hands on the keyboard already.
//
// 🔴🔴 "NORMAL SPACE MUST BEHAVE NORMALLY WHEN A TEXT FIELD IS FOCUSED", AND THAT IS THE ENTIRE
// RISK IN THIS FILE. A global keydown that swallows Space breaks typing — the single most common
// thing anyone does here — and it breaks it in a way that reads as the app being broken rather
// than as a shortcut misfiring. So the guard is not "is the composer focused" (which would still
// eat Space inside the rename field, the URL box, a `contenteditable` drawing caption or any input
// added later); it is "is the focused element one that takes text at all", asked of the DOM.
//
// 🔴 AND `repeat` IS DROPPED RATHER THAN DEBOUNCED. Holding a key fires keydown continuously at
// the OS repeat rate. Without this, holding Space for two seconds is thirty "start dictating"
// events, and the composer's own refusal ("already listening") would mask it — until the day
// somebody changes that refusal and a held key floods the recogniser.

import { useEffect, useRef } from "react";

/** Elements that own the keyboard while they are focused. */
function typingInto(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export interface CanvasKeysProps {
  /**
   * Advance past whatever the Canvas is holding open, or `null` when nothing is.
   *
   * 🔴 THE SAME HANDLER THE BUTTON GETS, PASSED IN — NEVER A SECOND ROUTE TO THE SAME PLACE. Which
   * region owns Continue is `continueOwner`'s decision and it is made once for the whole surface;
   * a shortcut that worked out for itself when to advance would be a second answer to that
   * question, free to say "yes" on a screen where the button correctly says nothing. `null` here
   * means the same thing as no button: there is nothing to advance past, so the chord does nothing.
   */
  onContinue: (() => void) | null;
  /** Ask the composer to start listening. Null where dictation is unavailable or unwanted. */
  onDictate: (() => void) | null;
  /** Stop listening and keep what was heard. Only called after this hook started it. */
  onAcceptDictation: () => void;
  /** Throw away an in-flight dictation, or put away a temporary state. */
  onEscape: () => void;
}

/**
 * The bindings, as a component that renders nothing.
 *
 * 🔴 A COMPONENT RATHER THAN A HOOK CALL IN `learning-canvas.tsx`, AND THE REASON IS ORDERING
 * RATHER THAN TASTE. Two of the four handlers below are derived from `continueOwner` and from the
 * composed regions, which the canvas cannot work out until well past its `!session.ready` early
 * return — and a hook cannot be called after a return. Written as a hook up top it would have to
 * read its handlers out of a ref filled in later in the same render, which is a value that is
 * correct only because of the order two unrelated lines happen to appear in.
 *
 * Mounted where the values exist, it takes ordinary props. It is also then absent on exactly the
 * screens that have nothing to bind — the loading branch has no Continue and no composer — which
 * is a property that falls out rather than one somebody maintains.
 */
export function CanvasKeys(props: CanvasKeysProps): null {
  useCanvasKeys(props);
  return null;
}

function useCanvasKeys({ onAcceptDictation, onContinue, onDictate, onEscape }: CanvasKeysProps): void {
  // 🔴 THE HANDLERS ARE READ THROUGH A REF SO THE LISTENER IS BOUND ONCE. Re-binding on every
  // render is not merely wasteful here: `holding` below is per-listener state, so a re-bind between
  // a keydown and its keyup would lose the fact that Space was ever pressed, and the microphone
  // would stay open with nothing able to close it.
  const latest = useRef({ onAcceptDictation, onContinue, onDictate, onEscape });
  latest.current = { onAcceptDictation, onContinue, onDictate, onEscape };

  useEffect(() => {
    /** Space is down AND this hook is what opened the microphone. */
    let holding = false;

    const onKeyDown = (event: KeyboardEvent) => {
      const handlers = latest.current;

      if (event.key === "Escape") {
        // 🔴 NOT PREVENTED, AND NOT SCOPED TO DICTATION. Escape means "put this away" everywhere in
        // this product — the selection popover, the add menu, the rename field all use it — and
        // those listeners are elsewhere. Letting the event through is what keeps one key meaning
        // one thing rather than whichever listener happened to be registered first.
        handlers.onEscape();
        return;
      }

      // ⌘/Ctrl + Enter — advance. 🔴 IT IS DELIBERATELY LIVE WHILE THE COMPOSER IS FOCUSED, unlike
      // Space: plain Enter submits there and this chord is unambiguous beside it. Someone who has
      // just finished reading a passage should not have to leave the text box to press on.
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        if (!handlers.onContinue) return;
        event.preventDefault();
        handlers.onContinue();
        return;
      }

      // Push-to-talk. 🔴 `event.code`, NOT `event.key`. `key` for the space bar is a single space
      // character, which is indistinguishable from a space produced by a compose sequence or an
      // alternative layout; `code` names the physical key and is what a hold-to-talk gesture
      // actually is.
      if (event.code !== "Space") return;
      // Modified Space is somebody else's shortcut (page-up, a browser command). Not ours to take.
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      // 🔴 THE TYPING GUARD. Space inside any text field is a space.
      if (typingInto(event.target)) return;
      // The OS repeat rate, dropped rather than debounced — see the file header.
      if (event.repeat || holding) return;
      if (!handlers.onDictate) return;
      // 🔴 PREVENTED ONLY ONCE WE ARE CERTAIN WE WANT IT. Space on a focused BUTTON activates it,
      // and this runs before that; preventing earlier would make the Continue button unpressable
      // from the keyboard, which is the accessibility regression this whole file must not cause.
      // By here the focus is on nothing that takes text — and a focused button is still a risk, so:
      if (event.target instanceof HTMLElement && event.target.closest("button,[role=button],a[href]")) return;
      event.preventDefault();
      holding = true;
      handlers.onDictate();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || !holding) return;
      holding = false;
      event.preventDefault();
      latest.current.onAcceptDictation();
    };

    // 🔴 A `blur` HANDLER, BECAUSE A KEYUP CAN BE LOST. Alt-tabbing away with Space held delivers
    // the keydown and never the keyup, and the microphone would stay open on a tab the learner is
    // not looking at. Recording somebody's room because they switched windows is the one failure in
    // this file that is worse than the shortcut simply not working.
    const onBlur = () => {
      if (!holding) return;
      holding = false;
      latest.current.onAcceptDictation();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
