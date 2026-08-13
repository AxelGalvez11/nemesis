"use client";

// What a canvas says when it has begun, nothing is running, and there is nothing to present.
//
// 🔴 IT REPLACES A BLANK PAGE THAT LASTED FOR EVER. Observed on production 3/3: upload a lecture,
// press send, and the surface went empty and stayed empty — 40+ seconds, no question, no text, no
// error, on the first thing a student ever does. Leaving and reopening the canvas from the Library
// then worked. That recovery is real and it is now a control here rather than something a learner
// has to stumble into.
//
// 🔴 IT IS NOT A LOADING STATE, AND THE DIFFERENCE IS THE WHOLE REASON THIS IS A SEPARATE
// COMPONENT. `thinking-phases.ts` rules that a phase name is only ever emitted by a step that is
// genuinely executing — "a caption that walked 'Mapping what you know → Finding the next gap' on a
// 900ms interval would look exactly like a system thinking and would be theatre". Nothing is
// running here, so nothing may imply that something is. A spinner over an idle runtime is the
// blank page again, with a moving part on it.
//
// 🔴 AND IT IS NOT A CLAIM ABOUT THE LEARNER. Nemesis finding nothing to ask is a fact about the
// material and about Nemesis. Five states must never collapse into one, and "we could not read
// this reliably" reading as "you have demonstrated everything" is the exact laundering the
// presentation invariant exists to prevent — so the subject of every sentence here is Nemesis.
//
// 🔴 RESTRAINED, NOT AN ERROR SCREEN (§19, §28). No icon, no panel, no red. The canvas already has
// an error banner for things that FAILED; this is a canvas that is simply empty-handed, and
// dressing it as a fault would misreport an ordinary outcome as a breakage.

/** Set to the position the first question occupies, so the surface does not jump when one arrives.
 *  Matches `CanvasThinkingPreview`, which is the state this most often follows. */
const TOP_INSET = "18vh";

export function CanvasQuiet({ onReload }: { onReload: () => void }) {
  return (
    <div
      aria-live="polite"
      className="mx-auto w-full max-w-(--canvas-column) px-6"
      role="status"
      style={{ paddingTop: TOP_INSET }}
    >
      <p className="text-[0.9375rem] text-(--ui-text-secondary)">
        Nemesis has your material but hasn&rsquo;t found anything to ask you about yet.
      </p>
      {/* Two moves, and both of them exist. Typing is the one the composer below already offers —
          said out loud because a learner looking at an empty canvas has no reason to believe the
          box at the bottom will do anything. */}
      <p className="mt-2 text-[0.875rem] text-(--ui-text-quaternary)">
        Tell it what you want to work on, or try again — your canvas is safe either way.
      </p>
      <button
        className="mt-5 rounded-full px-4 py-2 text-[0.8125rem] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
        onClick={onReload}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
