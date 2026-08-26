// What a research run is doing RIGHT NOW, in one line the learner can read.
//
// 🔴🔴 THIS EXISTS BECAUSE A MINUTE-LONG RUN HAD NO SURFACE AT ALL. Owner, 2026-08-26: *"I also try
// to do a deep research, but then once I click start, the chip just disappeared."* That is a
// complete and accurate description of what the canvas did. `startResearchPlan` cleared the plan
// card (correctly, so a second press cannot start a second run) and `makeDeliverable` then ran for
// about a minute WITHOUT setting `busy` and WITHOUT passing `onStep` on to `runResearch`. So the
// canvas showed nothing: no caption, no character at the centre, no disabled composer. The run was
// really executing the whole time, which is the worst version of this bug, because the learner has
// no way to tell it apart from a button that does nothing.
//
// `runResearch` has emitted `ResearchStep` since it was written. Nothing had ever read one.
//
// 🔴 EVERY LINE HERE NAMES WORK THAT IS GENUINELY RUNNING, which is `thinking-phases.ts`'s rule for
// this slot and the reason there is no timer anywhere in this file. A caption that advanced on an
// interval would be theatre, and indistinguishable from a run that had died.
//
// 🔴 FIELD-AGNOSTIC (CLAUDE.md). Nothing here knows what the subject is. A sub-question is quoted
// back as the learner's plan card already showed it, and a page is named by its host. The same
// lines read correctly for a statute, a bearing load and a nursing protocol.
//
// PURE. No React, no network, no clock. One decision, one place, unit-tested.

import type { ResearchStep } from "./research-model";

/**
 * How much of a sub-question fits in the caption slot.
 *
 * 🔴 A BOUND ON THE CAPTION, NOT ON THE PLAN. The plan card shows every sub-question in full and is
 * where the learner reads them; this is a one-line status under a character, next to a composer, in
 * the narrowest column on the canvas. A sub-question that ran on would push the line to two rows and
 * make the caption jump height every time the run moved on.
 */
const CAPTION_MAX = 52;

/** Cut at a word, and say that it was cut. A caption that stops mid-word reads as a rendering bug. */
function short(value: string): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= CAPTION_MAX) return clean;
  const cut = clean.slice(0, CAPTION_MAX);
  const space = cut.lastIndexOf(" ");
  return `${(space > CAPTION_MAX * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * The host of a page, for "Reading nature.com".
 *
 * 🔴 THE HOST, NEVER THE PATH. A full URL in a caption is unreadable at that size and carries a
 * query string into the middle of the canvas. The host is the part a person recognises, and it is
 * the same thing the reply's own source chips show.
 *
 * 🔴 AND A UNPARSEABLE URL IS NOT AN EXCUSE TO SAY NOTHING. Something is being read either way, so
 * the fallback still reports the step honestly rather than dropping the frame.
 */
function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * The busy caption for one step of a research run.
 *
 * 🔴 A `switch` OVER THE UNION WITH NO `default`, so a sixth kind of step is a compile error here
 * rather than a caption that silently stops changing while the run keeps spending money. This is the
 * same argument `MADE_NOTICE`'s `Record` makes in use-canvas-session.ts, and it is made for the same
 * reason: a chain of conditions has no missing case.
 */
export function researchStepLabel(step: ResearchStep): string {
  switch (step.kind) {
    case "planning":
      return "Planning the research";
    case "searching":
      return `Searching: ${short(step.subQuestion)}`;
    case "reading": {
      const name = host(step.url);
      return name ? `Reading ${name}` : "Reading a page it found";
    }
    case "writing":
      return "Writing the report";
    case "checking":
      // 🔴 THE COUNT IS REAL AND IT IS THE ONE THE CHECKER IS ON. This pass reads every point in the
      // draft back against the source it came from, which is the longest silent stretch of the run;
      // a bare "Checking" there looks stuck for thirty seconds.
      return `Checking the draft against its sources (${step.done} of ${step.total})`;
  }
}
