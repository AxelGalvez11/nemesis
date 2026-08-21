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

/**
 * The coverage note, joined onto a sentence rather than shown as its own label.
 *
 * 🔴 THE STORED NOTE IS WRITTEN FOR THE MODEL, NOT FOR A LEARNER. `coverageNoticeForModel` produces
 * *"Incomplete source: 28 pictures were not read. If the student's question depends on what is
 * missing, say so plainly…"* — a sentence and an instruction to DeepSeek. Printing that verbatim on
 * a learner's screen leaks the prompt. So the brackets go, the label goes, the instruction to the
 * model goes, and what is left is the fact.
 *
 * 🔴 THE SQUARE BRACKETS ARE PART OF THE WIRE FORMAT, NOT PUNCTUATION. `coverageNoticeForModel`
 * wraps the whole notice in `[…]` so it reads as an annotation inside a prompt rather than as
 * something the document said. On a screen they are just stray characters.
 */
function lower(note: string): string {
  const inner = note.replace(/^\s*\[/, "").replace(/\]\s*$/, "");
  const fact = inner.split(/(?<=\.)\s/)[0] ?? inner;
  const stripped = fact.replace(/^\s*Incomplete source:\s*/i, "").replace(/\.$/, "");
  return stripped.charAt(0).toLowerCase() + stripped.slice(1);
}

export function CanvasQuiet({
  onRetry,
  unread = [],
}: {
  onRetry: () => void;
  /**
   * What Nemesis could not read, per source, when it could not read all of one.
   *
   * 🔴🔴 REPORTED 2026-08-21: a 276-excerpt lecture PDF landed on this screen, and the sources
   * panel two clicks away said *"Incomplete source: 28 pictures were not read"*. Both statements
   * were true and only one of them was on screen — so the product knew exactly why it had nothing
   * to ask and showed the learner a dead end with a Try again button instead.
   *
   * 🔴 IT DOES NOT MAKE THE OUTCOME BETTER, IT MAKES IT HONEST, which is this file's whole rule
   * one level deeper. "Nemesis hasn't found anything to ask you about yet" is a fact about Nemesis;
   * the next sentence has to be the REASON when there is a known one, because a learner reading the
   * first sentence alone will conclude either that their document is unusable or that the app is
   * broken, and on a slide deck neither is true.
   *
   * 🔴 AND A SLIDE DECK IS THE COMMON CASE RATHER THAN AN EDGE ONE. Lecture slides are mostly
   * pictures with a few words of heading; a reader that cannot see the pictures has genuinely read
   * the document and genuinely found little in it. Saying so is what turns "this is broken" into
   * "this file is mostly diagrams", which is a thing a learner can act on.
   */
  unread?: readonly { title: string; note: string }[];
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
      {/* 🔴 THE REASON, WHEN THERE IS A KNOWN ONE, BEFORE THE SUGGESTION. A learner who is told what
          to do next without being told why is being managed rather than informed, and the sentence
          below ("tell it what you want to work on") reads as a shrug until this one explains it. */}
      {unread.length > 0 && (
        <p className="mt-2 text-[length:var(--canvas-text-small)] text-(--ui-text-secondary)">
          {unread.length === 1
            ? `It could not read all of ${unread[0]!.title}: ${lower(unread[0]!.note)}`
            : `It could not read all of ${unread.length} of your sources: ${unread
                .map((source) => `${source.title} (${lower(source.note)})`)
                .join(", ")}.`}
        </p>
      )}
      {/* Typing is the move the composer below already offers — said out loud because a learner
          looking at an empty canvas has no reason to believe the box at the bottom will do
          anything. */}
      <p className="mt-2 text-[length:var(--canvas-text-small)] text-(--ui-text-quaternary)">
        {unread.length > 0
          ? "Tell it which part you want to work on, or try again."
          : "Tell it what you want to work on, or try again."}
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
