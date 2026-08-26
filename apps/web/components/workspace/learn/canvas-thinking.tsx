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
// 🔴🔴 THE PLACEHOLDER DOT IS GONE AND THE CHARACTER STANDS HERE NOW (owner 2026-08-26: *"when
// there's any kind of thinking state, the mascot should be there to show that it's thinking"*).
// The header used to say outright that the 6px pulsing dot was "a placeholder … standing where the
// morphing Nemesis object will go". This is that object arriving, and it is the real character on
// the real engine rather than a second drawing of one.
//
// 🔴🔴 AND THIS IS THE ONLY WAIT IN THE CANVAS THE CHARACTER COULD NOT REACH FROM THE DOCK, WHICH
// IS WHY IT IS DRAWN HERE INSTEAD OF BY MOVING THE DOCK. `canvas-presence.ts` resolves a policy
// judgement to the presence `task`, not `preparing`, and the dock's station reads
// `turnInFlight || presence === "preparing"` — where `turnInFlight` is the SESSION's busy flag and a
// graded answer is the POLICY's. So during a judgement the dock scored corner on both terms and
// stood 60px tall in the bottom-left while this dot did the talking. (The comment in
// canvas-presence.ts claiming "the character walks to the middle of the surface" was describing a
// lane it never applied to.)
//
// Moving the dock to the centre for it would have been the obvious fix and is the wrong one: the
// whole point of this component is that a judgement leaves the stimulus in view, and a 126px
// character at 42% height covers the question being judged. So the character comes to the caption
// instead of the caption going to the character — small, at the foot of the page, blocking nothing.
// `learning-canvas.tsx` hides the dock while this is on screen, so there is never a second one.

import { useTheme } from "@/components/theme-provider";
import { NemesisAvatar } from "@/components/avatar/nemesis-avatar";
import { characterInk } from "@/lib/accent";
import { stateForCanvas } from "@/lib/character/stations";
import { THINKING_COPY, type ThinkingPhase } from "@/lib/learn/thinking-phases";

/**
 * 🔴 SIZED TO THE LINE IT STANDS BESIDE, NOT TO THE DOCK. `DOCK_SIZE` is 60 and would tower over a
 * caption set at `--canvas-text-small`. 28px puts the character at roughly cap-height plus its own
 * breathing room, so the pair reads as one object — a creature saying a sentence — rather than as a
 * picture that happens to sit next to some text.
 */
const THINKING_SIZE = 28;

export function CanvasThinking({ phase }: { phase: ThinkingPhase }) {
  const { accent, theme } = useTheme();
  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute inset-x-0 bottom-[104px] z-20 flex justify-center px-4"
      role="status"
    >
      <div className="flex items-center gap-2.5">
        {/* 🔴 NOT KEYED ON THE PHASE, UNLIKE THE WORDS BESIDE IT. Re-mounting is how the caption
            gets its entry fade, and it is exactly what the character must not do: the engine, its
            clock and the gaze all live in this subtree, so keying it would restart the character
            from scratch every time a step finished — a flicker on every phase change, which is the
            opposite of what standing here is for. It plays continuously while the judgement runs
            and the sentence changes underneath it. */}
        <span className="shrink-0" style={{ height: THINKING_SIZE, width: THINKING_SIZE }}>
          {/* Levelled like every other character in the app (`facing`) — at 28px an authored
              three-quarter head does not read as depth, it reads as a blob with its eyes off one
              edge. */}
          <NemesisAvatar
            accent={accent}
            animation={stateForCanvas({ listening: false, preparing: false, thinking: true })}
            ink={characterInk(accent, theme === "dark")}
            size={THINKING_SIZE}
            facing="forward"
            track
          />
        </span>
        {/* 🔴 KEYED ON THE PHASE so React remounts it and the entry fade runs. Without the key the
            text would swap in place mid-word, which reads as a glitch rather than as a step
            finishing and another beginning. */}
        <span className="canvas-phrase text-[length:var(--canvas-text-small)] text-(--ui-text-tertiary)" key={phase}>
          {THINKING_COPY[phase]}
        </span>
      </div>
    </div>
  );
}
