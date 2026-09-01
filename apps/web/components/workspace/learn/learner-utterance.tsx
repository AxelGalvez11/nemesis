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
   * 🔴 DRAWN AS A RECEIPT SINCE 2026-08-31 (owner, with the reference open: *"the transcribed
   * text is lighter and in itallics"*). A spoken utterance renders italic in a softened ink, the
   * reference's own treatment — it says HOW the words arrived, the way a timestamp says when.
   * What §26 forbade still holds in full: the treatment never keys to a verdict, never reaches
   * the evidence log, and a spoken answer demonstrates exactly what a typed one does. The data
   * attribute stays for the DOM question ("do spoken answers score worse?").
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
        // 🔴🔴 IT FOLLOWS THE ACCENT FROM SETTINGS — owner, 2026-08-26: *"the bubble should follow
        // the accent from settings, like does the mascot and send button."* Which is the third time
        // he has made the same ruling: `--ui-action`'s own note in desktop-ui.css records
        // 2026-08-23, *"the send button and the mascot should be following the same accent color"*,
        // and *"there is no second colour to disagree"*. A fixed blue here was that second colour.
        //
        // 🔴🔴 THE TEXT IS `--ui-action-glyph`, NOT WHITE, AND THAT IS NOT A DETAIL — WHITE WOULD
        // GO INVISIBLE. `--ui-action` is the near-black ink in light mode and the near-WHITE one in
        // dark, because the accent has to carry a glyph against the editor ground and the two sit
        // on opposite sides of the lightness midpoint. `accentGlyph()` computes the partner per
        // accent ("white on the near-black ink, near-black on the near-white one"), so the pair
        // holds its contrast for every accent a learner can pick rather than for the one I looked
        // at. The owner asked for white on 2026-08-26 and got it; that was against a fixed blue,
        // and honouring the LETTER of it here would break the instruction that replaced it.
        //
        // 🔴 §35.1 SURVIVES THE HUE CHANGE, because it was never about the hue. *"Blue means: this
        // came from you. It does NOT mean correct."* What has to hold is that the learner's words
        // carry a distinct, unconditional ground that is never keyed to a verdict — and they do.
        // There is no verdict prop here and there must not be one.
        // 🔴 PIXELS, NOT SCALE STEPS, AND THAT IS THE REM TRAP AGAIN. This app sets
        // `html { font-size: 112.5% }`, so `px-4` is 18px here and `py-2.5` is 11.25px, against the
        // reference's 16 and 10. `leading-relaxed` lands on 26px against their 24. Measured in the
        // owner's own account 2026-08-31: padding 10px 16px, line-height 24px, radius 22px,
        // max-width 70%. The last two already matched; these three did not.
        "inline-block max-w-[70%] rounded-[22px] px-[16px] py-[10px] text-left",
        "text-[length:var(--canvas-text-body)] leading-[24px]",
        // 🔴 THE COLOUR IS ONE BRANCH, NOT A BASE PLUS AN OVERRIDE. Two text-colour utilities on
        // one element resolve by stylesheet order, not by which was written later here.
        via === "spoken"
          ? "italic [color:color-mix(in_srgb,var(--ui-action-glyph)_85%,transparent)]"
          : "text-(--ui-action-glyph)",
        "bg-(--ui-action)",
        className,
      )}
      data-learner-utterance=""
      {...(via ? { "data-via": via } : {})}
    >
      {children}
    </p>
  );
}
