"use client";

// Nemesis, visibly working — without taking the page away.
//
// 🔴 IT REPLACES A SCRIM, AND THAT IS THE WHOLE DESIGN. The old whole-page busy state painted 70%
// over the document and put a glyph in the middle of it: everything the learner had been reading
// went grey, so the context they were holding in their head had to be rebuilt when it cleared. This
// sits at the foot of the page, leaves every pixel of content visible and legible, and blocks
// nothing.
//
// 🔴 THE CAPTION IS THE STEP THAT IS RUNNING, NEVER A SEQUENCE ON A TIMER. `thinking-phases.ts`
// explains why at length; the short version is the microphone waveform's rule — if animation
// implies information, the information has to be real. Nothing here counts, estimates a percentage,
// or walks a list of plausible stages.
//
// 🔴 AND IT IS NOT THE FINAL LOADING IDENTITY. The mark below is a placeholder: a quiet pulsing dot
// standing where the morphing Nemesis object will go. A spinning glyph would have been faster to
// write and would have quietly become the product's answer to "what does thinking look like".

import { THINKING_COPY, type ThinkingPhase } from "@/lib/learn/thinking-phases";

export function CanvasThinking({ phase }: { phase: ThinkingPhase }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-[104px] z-20 flex justify-center px-4"
      role="status"
    >
      <div className="flex items-center gap-2.5">
        {/* The placeholder for the morphing object. Deliberately the least interesting thing on
            screen: 6px, no ring, no sweep, no orbit. */}
        <span className="h-[6px] w-[6px] shrink-0 animate-pulse rounded-full bg-(--ui-text-quaternary)" />
        {/* 🔴 KEYED ON THE PHASE so React remounts it and the entry fade runs. Without the key the
            text would swap in place mid-word, which reads as a glitch rather than as a step
            finishing and another beginning. */}
        <span className="canvas-phrase text-[0.8125rem] text-(--ui-text-tertiary)" key={phase}>
          {THINKING_COPY[phase]}
        </span>
      </div>
    </div>
  );
}
