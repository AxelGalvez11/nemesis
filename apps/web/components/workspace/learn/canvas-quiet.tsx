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

export function CanvasQuiet({
  onRetry,
  unread = null,
}: {
  onRetry: () => void;
  /**
   * What the parse could not read, in the reader's own words, when it could not read all of it.
   *
   * 🔴🔴 THE DIFFERENCE BETWEEN "NOTHING HERE" AND "I COULD NOT SEE THE PART THAT MATTERS".
   * Reported 2026-08-21 with a 276-page-excerpt lecture that produced no questions: the text read
   * perfectly and 28 pictures did not, and on a slide deck the pictures are the tables. The
   * sentence above is true either way and useless in the second case, which is the one that
   * actually happened — the learner is left believing their document holds nothing worth asking
   * about, when what happened is that we could not open the part that does.
   */
  unread?: string | null;
}) {
  return (
    <div
      aria-live="polite"
      className="mx-auto w-full max-w-(--canvas-column) px-6"
      role="status"
      style={{ paddingTop: TOP_INSET }}
    >
      {/* 🔴🔴 NOT "YOUR MATERIAL" — owner call, 2026-08-19: *"why does it still show this? i didnt
          upload anything?"* He had not. He typed "organic chemistry functional groups" and Nemesis
          went and found three pages itself (OpenStax, Wikipedia, a functional-groups guide). Calling
          those "your material" tells a learner they attached something they never attached, and the
          first thing they do is go looking for a file they cannot find.

          🔴 THE FIX IS TO STOP CLAIMING OWNERSHIP, NOT TO BRANCH ON PROVENANCE. A version that said
          "your material" or "the pages Nemesis found" depending on where the sources came from would
          be right more often and wrong in a worse way — a canvas holding both would have to pick
          one and misdescribe the other. The sentence does not need the possessive at all: what the
          learner needs to know is that Nemesis has nothing to ask yet, and the subject stays
          Nemesis, which is the rule this file already holds.

          🔴 AND SHORTER, because the owner also asked for less: *"i dont want this unnessary wordy
          gray text"*. "Your canvas is safe either way" was reassurance about a danger nobody had
          raised, which is how a calm interface starts sounding nervous. */}
      <p className="text-[length:var(--canvas-text-body)] text-(--ui-text-secondary)">
        Nemesis hasn&rsquo;t found anything to ask you about yet.
      </p>
      {/* Typing is the move the composer below already offers — said out loud because a learner
          looking at an empty canvas has no reason to believe the box at the bottom will do
          anything. */}
      {unread && (
        <p className="mt-2 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
          It read the text of this document, but not all of it: {unread.replace(/\.$/, "")}. Questions come
          mostly from tables and diagrams, which is often what a picture holds.
        </p>
      )}
      <p className="mt-2 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
        Tell it what you want to work on, or try again.
      </p>
      <button
        className="mt-5 rounded-full px-4 py-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary) ring-1 ring-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-bg-tertiary) hover:text-(--ui-text-primary)"
        onClick={onRetry}
        type="button"
      >
        Try again
      </button>
    </div>
  );
}
