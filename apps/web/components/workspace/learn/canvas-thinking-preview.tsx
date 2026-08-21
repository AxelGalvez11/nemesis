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
  mascot = false,
}: {
  label?: string | null;
  /**
   * The learner just sent something and is waiting for the answer to it.
   *
   * 🔴🔴 TWO WAITS, TWO SHAPES, AND THE §21 ARGUMENT ABOVE IS WHY BOTH EXIST RATHER THAN ONE
   * REPLACING THE OTHER. The forming lines are set to the column, the position and the leading a
   * QUESTION occupies, so the first question lands where the placeholder already was — "the
   * structure resolves into the content rather than being swapped for it". That reasoning holds
   * exactly where it was written: a canvas generating its first question.
   *
   * It does not hold for a conversational turn. What lands there is a paragraph of unknown length,
   * so lines pretending to be its shape would be a guess, and the wait is usually seconds rather
   * than a minute. What that moment needs is different: the learner's own words are never rendered,
   * so this is the ONLY acknowledgement that their send happened at all.
   *
   * Owner's call, 2026-08-20, both halves: a mascot for the thinking state, and it replaces what
   * was on screen rather than sitting under it.
   */
  mascot?: boolean;
}) {
  if (mascot) {
    return (
      <div
        aria-live="polite"
        // 🔴 `min-h-[70vh]`, NOT `min-h-full`. This renders inside `CanvasFade`, which is a plain
        // `<div>` with no height of its own, so a percentage minimum has nothing to resolve
        // against and collapses to the content — measured in a browser: the mascot sat at the very
        // top of the column instead of the middle of the page. A viewport unit always resolves.
        // 🔴 THE CAPTION SITS AT THE FOOT, NOT IN THE MIDDLE (owner 2026-08-20: "the thinking
        // sentence and phrase overlap with the mascot"). It used to centre itself in this box,
        // which is exactly where the character walks to — so the words printed straight through
        // the dots. The character owns the middle of the surface; every thinking caption belongs
        // near the composer, which is also where `CanvasThinking` has always put its own.
        // 🔴 A ROW. Owner, 2026-08-20: *"the mascot three dot should have the thinking preview to
        // the right of it."* Stacked, the caption sat well below the character and the two read as
        // two separate things happening. The `justify-end` and the 104px of bottom padding stay:
        // they are what puts this on the same line as the docked character rather than in the
        // middle of the page.
        className="flex min-h-[70vh] flex-row items-center justify-end px-6 pb-[104px] gap-3"
        role="status"
      >
        {/* 🔴 THE CHARACTER IS NOT DRAWN HERE, AND THAT IS THE FIX FOR SIX DOTS.
            This used to render its own mascot while `BloubDock` rendered another on the same
            surface — both centred, both playing `thinking`, so the learner saw two sets of three
            dots stacked. Deleting the duplicate RENDERER did not fix it, because the defect was
            never two renderers: it was two MOUNTS of one renderer. The dock owns the character on
            this surface; this component owns the caption beside it and nothing else. */}
        {label && (
          <span className="canvas-phrase text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
            {label.replace(/…$/, "")}…
          </span>
        )}
      </div>
    );
  }

  // 🔴🔴 THE SKELETON IS GONE. Owner, 2026-08-20: *"i dont want skeleton loader."*
  //
  // 🔴 AND ITS ORIGINAL ARGUMENT WAS GOOD, WHICH IS WHY IT LASTED. Three staggered bars occupied
  // the shape a QUESTION occupies, so the first question landed where the placeholder already was:
  // the structure resolved into the content instead of replacing it. That is a real effect and it
  // is why this was not simply deleted earlier.
  //
  // It is also a guess about what is coming, drawn as though it were already there — three grey
  // bars promising a paragraph that may turn out to be a molecule, a plot, or one sentence. The
  // mascot says the same thing ("something is happening") without pretending to know the shape of
  // it, and the owner has now asked for the mascot twice.
  return (
    <div
      aria-live="polite"
      className="flex min-h-[70vh] flex-row items-center justify-center gap-3 px-6"
      role="status"
    >
      {label && (
        <span className="canvas-phrase text-[length:var(--canvas-text-meta)] text-(--ui-text-quaternary)">
          {label.replace(/…$/, "")}…
        </span>
      )}
    </div>
  );
}
