// The learner's own words, wherever they are shown back to them (§46.2).
//
// 🔴 ONE COMPONENT BECAUSE THE RULE IS ABOUT RECOGNITION, NOT ABOUT ONE SCREEN. §46.2 asks that a
// learner "be able to distinguish instantly: This came from me / This came from Nemesis". That only
// holds if their words look the same every time they appear — typed, spoken, on a verdict screen or
// anywhere added later. Two call sites styling it independently is the failure mode, and it starts
// the day the second call site is written.
//
// 🔴 THE TREATMENT IS A SOLID BUBBLE (WAS A TINT UNTIL 2026-08-26), AND IT REPLACED A PAIR OF
// QUOTE MARKS AT 24.75px. Quotation
// marks are punctuation, not ownership: they read as "someone said this", which is also true of
// every line Nemesis renders. Size was doing the rest of the work, and §46.3 rules that out —
// "Large fonts are not a semantic tool in Nemesis." A container with its own ground says
// authorship structurally, at body size, the way a chat interface does without being a transcript.
//
// 🔴 IT HUGS ITS TEXT — `inline-block`, never a full-width block. A bubble spanning the reading
// column is indistinguishable from a paragraph, which is exactly what it must not look like.
//
// 🔴 AND IT NEVER TAKES A VERDICT. There is no `correct` prop and there must not be one. Contract
// §35.1: "Blue means: this came from you. It does NOT mean correct. Keep that semantic stable."
// This once WAS a `VERDICT_TONE` map that painted the learner's sentence green or red — the
// judgement wearing the learner's voice, so their words and Nemesis's opinion of them could not be
// told apart. §46.2 restates it: "Do not color learner text according to correctness. The learner's
// words retain the learner visual identity whether correct, partial, or wrong. Nemesis's judgement
// is a separate annotation." The verdict renders BELOW this, in Nemesis's own voice.

import { cn } from "@/lib/utils";
import type { LearnerInputModality } from "@/lib/learn/canvas-model";

export interface LearnerUtteranceProps {
  /** Exactly what the learner produced. Never trimmed of meaning, never re-worded. */
  children: React.ReactNode;
  className?: string;
  /**
   * How the words arrived.
   *
   * 🔴 RECORDED, NOT DRAWN DIFFERENTLY. A spoken answer and a typed one demonstrate the same
   * capability (§26), so styling them apart would invent a distinction the cognition layer
   * deliberately does not make. It rides on the element as a data attribute so a later question
   * ("do spoken answers score worse?") can be asked of the DOM without a second visual language.
   *
   * 🔴 `null` IS "NOT OBSERVED", AND IT IS A REAL CASE RATHER THAN A GAP. A learner who taps an
   * option did not type, speak or write it, so every value of the union would be a false claim about
   * how those words arrived. The default was `"typed"`, which is exactly the kind of quiet
   * fabrication this codebase refuses in the evidence log, and it had no business being different in
   * the DOM. When it is null the attribute is not emitted at all, so a query for spoken answers can
   * never accidentally count a tap as one.
   */
  via?: LearnerInputModality | null;
}

export function LearnerUtterance({ children, className, via = "typed" }: LearnerUtteranceProps) {
  return (
    <p
      className={cn(
        // 🔴🔴 A SOLID GROUND WITH WHITE TEXT, MEASURED OFF ChatGPT — owner, 2026-08-26: *"for the
        // chat bubbles, make sure the user text bubble font is white."* Their bubble is a solid
        // fill at `max-width: 70%`, radius 22px, padding 10px 16px, text 16px on a 24px line and
        // effectively white. Ours matched none of it: blue text on a 10% tint, no max-width, 27px
        // radius, 11.25/18 padding.
        //
        // 🔴 THE TINT COULD NOT SIMPLY GAIN WHITE TEXT, AND THAT IS WHY THE GROUND CHANGED TOO.
        // What was here was a 10% wash of the authorship blue, chosen so "the ground and the text
        // say the same thing… if the text colour ever fails to load". White on a 10% wash is
        // unreadable in light mode — the instruction is only satisfiable with a ground dark enough
        // to carry it, which is exactly what the reference uses.
        //
        // 🔴 §35.1 IS UNTOUCHED AND IS ARGUABLY STATED HARDER. *"Blue means: this came from you."*
        // The bubble is now that blue at full strength rather than a wash of it. What it must still
        // never mean is CORRECT — there is no verdict prop here and there must not be one.
        "inline-block max-w-[70%] rounded-[22px] px-4 py-2.5 text-left",
        "text-[length:var(--canvas-text-body)] leading-relaxed text-white",
        "bg-(--ui-learner)",
        className,
      )}
      data-learner-utterance=""
      {...(via ? { "data-via": via } : {})}
    >
      {children}
    </p>
  );
}
