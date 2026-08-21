"use client";

// Text with a dotted underline under every word the learner has already asked about.
//
// 🔴 REPORTED 2026-08-20: *"the word that was highlighted to explain should have an dotted
// underlined like if its a new vocab term."* Every piece of this existed and none of it was
// connected. `canvas-document.tsx` has drawn that underline for weeks — but only over
// `block.terms`, which INGESTION attaches, and only inside a document block. So a word the learner
// personally stopped on wore nothing, and on a topic-only canvas (§24: zero blocks by design) the
// affordance could not appear at all.
//
// 🔴 IT REOPENS RATHER THAN RE-ASKS. Pressing a marked word runs the same "define" it ran the first
// time, through the same door — `askAboutSelection` — so the event log, the sentence context and
// the provenance check are identical whether the learner dragged across the word or clicked its
// underline. A second mechanism for the same act is how the two drift.

import { lookedUpMarks, splitByTerms, type MarkedTerm } from "@/lib/learn/canvas-vocabulary";

export function LookedUpText({
  onTerm,
  terms,
  text,
}: {
  /** Pressing a marked word. Given the word and where it sits, so the popover can be placed. */
  onTerm?: (term: MarkedTerm, rect: DOMRect) => void;
  terms: readonly string[];
  text: string;
}) {
  const marks = lookedUpMarks(text, terms);
  // 🔴 THE ORDINARY CASE RETURNS THE STRING ITSELF, not a list of one run. Nearly every piece of
  // text on this surface has no marks in it, and wrapping all of them in fragments to support the
  // rare one is how a selection range starts landing on a different node than it used to.
  if (marks.length === 0) return <>{text}</>;

  // 🔴 THE UNDERLINE WITHOUT A HANDLER IS A HINT, NOT A BUTTON, AND THAT DISTINCTION IS LOAD-BEARING
  // ON THIS SURFACE. A question already carries `selectableRegion("question")`, so the learner can
  // drag across the word and use the toolbar — the mark is telling them "you asked about this one
  // before". Rendering a <button> that calls an absent callback would be a control that does
  // nothing, which is this codebase's most-repeated defect and has its own acceptance test.
  const MARK_CLASS = "border-b border-dotted border-(--ui-text-quaternary)";

  return (
    <>
      {splitByTerms(text, marks).map((run, index) =>
        run.mark && !onTerm ? (
          <span className={MARK_CLASS} key={`m-${run.mark.start}-${index}`} title={`You looked up "${run.text}"`}>
            {run.text}
          </span>
        ) : run.mark ? (
          <button
            // The same treatment `canvas-document.tsx` gives an ingestion-nominated term, so the two
            // are one affordance rather than two that look similar.
            className={`cursor-help ${MARK_CLASS} bg-transparent p-0 text-left font-[inherit] text-[length:inherit] leading-[inherit] text-[color:inherit] hover:border-(--ui-text-secondary)`}
            key={`${run.mark.start}-${index}`}
            onClick={(event) => {
              // 🔴 A click that ENDS a drag is not a click on the word. Without this, selecting a
              // phrase that happens to finish inside a marked term fires the popover on mouse-up
              // and replaces the toolbar the learner was reaching for.
              if (!window.getSelection()?.isCollapsed) return;
              onTerm?.(run.mark!, event.currentTarget.getBoundingClientRect());
            }}
            title={`What does "${run.text}" mean here?`}
            type="button"
          >
            {run.text}
          </button>
        ) : (
          <span key={`t-${index}`}>{run.text}</span>
        ),
      )}
    </>
  );
}
