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


import { logoFor } from "@/lib/workspace/app-logos";

/** Set to the leading of the text that replaces them, so nothing shifts on the swap. */

export function CanvasThinkingPreview({
  app = null,
  label = null,
}: {
  /**
   * The connected app this step is running against, as its toolkit slug.
   *
   * 🔴🔴 THIS IS NOT THE MARK THAT WAS DELETED, AND THE MEASUREMENT SAYS SO. What died on
   * 2026-08-30 was a set of GENERIC glyphs beside every caption, removed the day the reference was
   * read as a bare shimmering sentence. That reading was taken with NO app connected and it is
   * still exactly right: plain thinking gets nothing beside it, and `app` is null for every step
   * Nemesis runs on its own.
   *
   * Re-measured 2026-08-31 in the owner's account with Google Calendar connected: a step that
   * reaches an app shows THAT APP'S OWN FAVICON at 20px, an 8px gap, then the sentence. So the
   * mark is an identity for a specific app, not decoration on a caption, and it appears on exactly
   * the steps that have one.
   */
  app?: string | null;
  label?: string | null;
  /** Kept for callers mid-migration; the visible split it used to select is gone. */
  mascot?: boolean;
}) {
  // 🔴🔴 IT IS VISIBLE AGAIN, AND IT IS BACK IN THE CONVERSATION — owner, 2026-08-31: *"inside a
  // canvas, when it's in chat mode, the thinking preview is at the bottom next to the mascot, and
  // it should be above, where it usually is with ChatGPT."*
  //
  // The caption moved onto the dock on 2026-08-25, when the character stood at the CENTRE of an
  // otherwise empty screen and the words belonged beside it. The canvas is a chat now: the
  // character stands on the composer at the bottom, so "beside the character" became "in the
  // bottom left corner", underneath the very conversation it is about. In the reference the step
  // is a line in the thread, exactly where the answer is about to appear.
  //
  // 🔴 MEASURED IN THE OWNER'S OWN CHATGPT, 2026-08-31: the live "Thinking" line renders at
  // 16px/24px at weight 400, in the body colour, left-aligned on the answer's own column (x=481,
  // the same left edge as the assistant message) directly under the learner's bubble. A finished
  // one reads "Worked for 59s" in the same slot. So: the canvas column, the body size, the
  // shimmer this app already uses for a step that is still running.
  //
  // 🔴 `leading-[24px]`, NOT `leading-6`, AND THAT IS THE REM TRAP RATHER THAN A PREFERENCE. This
  // app sets `html { font-size: 112.5% }`, so Tailwind's `leading-6` is 1.5rem = 27px here and the
  // line measured 16/27 against the reference's 16/24. The number is named in pixels because the
  // reference's number is in pixels.
  //
  // 🔴 THE SHIMMER IS THE SAME `canvas-thinking-word` THE DOCK USED, not a second treatment. The
  // rule it obeys is unchanged and is stated at the top of this file: the caption names the step
  // that is genuinely running, never a sequence on a timer.
  //
  // 🔴 AND THE SHIMMER STAYS ON THE WORDS ONLY. Wrapping the row would paint the favicon
  // transparent between sweeps, which is the same trap `thinking-marks.test.ts` records two
  // sessions independently finding with the domain chips.
  const appLogo = app ? logoFor(app) : null;
  return (
    <div className="mx-auto w-full max-w-(--canvas-column) px-6 pb-2" data-canvas-thinking-line="">
      <p
        aria-live="polite"
        className="flex items-center gap-[8px] text-[length:var(--canvas-text-body)] leading-[24px] text-(--ui-text-secondary)"
        role="status"
      >
        {/* 🔴 20px AND AN 8px GAP, BOTH MEASURED OFF THE REFERENCE'S OWN ROW. Its natural file is
            256px, so it is drawn down rather than up and stays sharp. `aria-hidden` because the
            sentence beside it already says which app this is — the icon repeats it for the eye
            only, and a screen reader announcing "Google Calendar Searching your Google Calendar"
            is the same fact twice.
            eslint-disable-next-line @next/next/no-img-element */}
        {appLogo ? <img alt="" aria-hidden="true" className="size-[20px] shrink-0" height={20} src={appLogo} width={20} /> : null}
        <span className="canvas-thinking-word">{label ? label.replace(/…$/, "") : "Thinking"}</span>
      </p>
    </div>
  );
}

/** The announcement only, for callers that draw their own line. */
export function CanvasThinkingAnnouncement({ label = null }: { label?: string | null }) {
  // 🔴 THE ANNOUNCEMENT ON ITS OWN. The character is `aria-hidden` decoration, so wherever the
  // step's name is drawn it also has to be SAID; this is that half, for a caller that already
  // draws its own line and would otherwise announce the same thing twice.
  return (
    <div aria-live="polite" className="sr-only" role="status">
      {label ? `${label.replace(/…$/, "")}…` : null}
    </div>
  );
}
