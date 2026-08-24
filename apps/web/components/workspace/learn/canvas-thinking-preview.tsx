"use client";

// What the Canvas shows between "send" and the first real interaction (UX brief §5, §20, §21).
//
// 🔴 IT REPLACES A CENTRED SPINNER ON AN EMPTY SCREEN, WHICH THE BRIEF FORBIDS BY NAME. Until now
// a canvas with material coming in painted `canvas-empty.tsx` — a large dashed upload box with a
// spinning glyph in it reading "Reading your material…" — and a canvas generating anything painted
// a 70% scrim with a spinner in the middle. §5 rules out every part of that: no large grey upload
// box, no centred spinner on an empty screen, no progress bar without real progress, no fake
// percentage, no large loading headline.
//
// 🔴 THE ANIMATION CARRIES THE STATE, NOT THE TEXT (§5, §22). Three low-contrast lines with a soft
// highlight travelling left to right — the one motion system §20 asks for, "information forming
// from left to right". A spinner says WAIT; a forming line says SOMETHING IS BEING MADE.
//
// 🔴 THE LINES ARE THE SHAPE OF THE THING THAT REPLACES THEM (§21). Loading must not be a loader
// that disappears, then a blank moment, then content popping in. These are set to the canvas
// column, at the vertical position and the leading a question occupies, so the first diagnostic
// lands where the placeholder already was — the structure resolves into the content rather than
// being swapped for it.
//
// 🔴 THE CAPTION IS THE STEP THAT IS ACTUALLY RUNNING — NEVER A SEQUENCE ON A TIMER. This is the
// rule `canvas-motion.test.ts` already enforces for `CanvasThinking`, and it applies here for the
// same reason: a plausible walk through "Reading the material → Mapping the concepts → Preparing
// your first question" is exactly what a working system looks like, which is what makes a canned
// one undetectable. `label` is handed down from the busy state that is genuinely in flight, so
// there is no clock in this file and nothing to keep in step. When the caller has no honest label
// it passes none and the lines carry the state alone, which §5 explicitly permits.
//
// 🔴 REDUCED MOTION IS NOT "SLOWER", IT IS STILL. `.canvas-forming` is registered in the
// `prefers-reduced-motion` block in globals.css alongside `.canvas-swap` and `.canvas-phrase`;
// the lines stay, the sweep stops. Someone who asked the system to stop moving still has to be
// able to see that the region is busy, so they hold their resting contrast rather than vanishing.


/** Set to the leading of the text that replaces them, so nothing shifts on the swap. */

export function CanvasThinkingPreview({
  label = null,
}: {
  label?: string | null;
  /** Kept for callers mid-migration; the visible split it used to select is gone. */
  mascot?: boolean;
}) {
  // 🔴🔴 NOTHING VISIBLE HERE ANY MORE, IN EITHER WAIT — AND THAT IS THE FIX (owner 2026-08-25,
  // on production: "I'll send a prompt. It won't show the mascot… it would just disappear").
  // This component stopped drawing its own character when the caption moved onto the dock, but
  // the dock was STILL being switched off for it (`hidden={presence === "preparing"}` in
  // learning-canvas.tsx) — a guard protecting against a second character that no longer
  // existed, which left NO character at all on the one screen whose whole job is "something is
  // happening". The dock now owns the character and the caption in every wait; what remains
  // here is the half a screen reader needs, because the dock is aria-hidden decoration and
  // deleting the announcement would take the running step's name away from the one audience
  // that cannot see the character.
  return (
    <div aria-live="polite" className="sr-only" role="status">
      {label ? `${label.replace(/…$/, "")}…` : null}
    </div>
  );
}
