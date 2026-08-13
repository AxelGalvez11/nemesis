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
const LINE_HEIGHT = "12px";

/** Three, and the third is short. A block of equal-length bars reads as a table or a placeholder
 *  image; an uneven last line is what a paragraph of prose actually looks like from a distance. */
const LINES: readonly string[] = ["100%", "92%", "64%"];

export function CanvasThinkingPreview({ label = null }: { label?: string | null }) {
  return (
    <div
      aria-live="polite"
      className="mx-auto flex w-full max-w-(--canvas-column) flex-col gap-[14px] px-6 pt-[18vh]"
      role="status"
    >
      {LINES.map((width, index) => (
        <span
          // 🔴 STAGGERED, NOT SYNCHRONISED. Three bars pulsing in lockstep read as one flashing
          // block — a single object blinking rather than several things being written. The offset
          // is what makes the highlight read as travelling DOWN the paragraph as well as across it.
          className="canvas-forming block rounded-full"
          key={width}
          style={{ animationDelay: `${index * 140}ms`, height: LINE_HEIGHT, width }}
        />
      ))}
      {/* Understated and ephemeral, and there is no second line and no counter. §23 bans "Step 1
          of 4"; §22 bans explaining the machinery at all. */}
      {label && (
        <span className="canvas-phrase mt-[10px] text-[13px] text-(--ui-text-quaternary)">
          {label.replace(/…$/, "")}…
        </span>
      )}
    </div>
  );
}
