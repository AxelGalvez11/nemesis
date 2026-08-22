// What Nemesis shows while it works — and what it is never allowed to show.
//
// 🔴🔴 THIS REPLACES A "SHOW THINKING" DISCLOSURE, AND THE REPLACEMENT IS THE WHOLE POINT. The first
// build put the reasoner's raw `reasoning_content` behind a control under the answer. Owner,
// 2026-08-21: *"Do not implement 'Show thinking' as a raw chain-of-thought viewer… The thinking
// preview is a temporary, user-facing representation of what Nemesis is doing while the response is
// being generated. It is not the model's raw reasoning and it should not remain as a separate
// reasoning transcript below the answer."*
//
// Those are different features and the owner is right that the second is the better one. A
// transcript under the answer is an archive nobody opens twice; a line that says what is happening
// while it happens is the difference between a wait and a tutor working in front of you.
//
// 🔴 SO RAW REASONING NEVER REACHES THIS FILE, LET ALONE A SCREEN. The pipeline the owner named is
// `internal reasoning → sanitized progress summary → UI`, and the sanitising is done by the MODEL,
// in the decision envelope, in learner-facing words it wrote for a learner to read. Nothing here
// paraphrases `reasoning_content`, because a paraphrase of a chain of thought is still a chain of
// thought with the hedging removed — which is worse, not better.
//
// 🔴🔴 AND A MILESTONE IS NEVER SHOWN UNTIL ITS EVENT HAS HAPPENED. This is the rule that separates
// the feature from the thing `thinking-phases.ts` bans by name — "a caption that walked 'Mapping
// what you know → Finding the next gap' on a 900ms interval would look exactly like a system
// thinking and would be theatre". The model writes what it will do at each stage; the STAGE is
// advanced only by something real occurring. A turn that never searches never shows the line about
// searching, however confidently the model wrote it.
//
// PURE. No React, no I/O, no clock — and the absence of a clock is load-bearing rather than tidy.

/**
 * How far through a turn the work has actually got.
 *
 * 🔴 EVENTS, NOT A TIMELINE. Each of these is entered because something happened — a decision was
 * parsed, a search request went out, results came back, the tools finished — and no stage can be
 * reached by waiting. A turn that answers straight away visits `decided` and then `finishing`,
 * which is why the middle two must never be assumed.
 */
export type TurnStage =
  /** The model has said what it means to do. Nothing has run yet. */
  | "decided"
  /** A search request has genuinely gone out. */
  | "searching"
  /** Results are back and the model is reading them. */
  | "reading"
  /** Tools are done; the answer is being written. */
  | "finishing";

export const TURN_STAGES: readonly TurnStage[] = ["decided", "searching", "reading", "finishing"];

/** The most milestones one turn may state. Four stages, four lines, and never a fifth. */
export const MAX_MILESTONES = TURN_STAGES.length;

/**
 * The longest one milestone may be.
 *
 * 🔴 THE OWNER'S OWN SPEC: *"one sentence maximum, usually about 4–12 words."* This is that in
 * characters, with room for a long noun phrase. Past it the line wraps beside a 44px character and
 * stops being a glance.
 */
export const MAX_MILESTONE_LENGTH = 72;

/**
 * Shapes a milestone may never take.
 *
 * 🔴 THE OWNER LISTED THESE, AND EVERY ONE OF THEM IS A WAY OF LOOKING BUSY RATHER THAN BEING
 * INFORMATIVE: *"no fake progress, no percentages, no 'Step 1 / Step 2', no token counts, no
 * technical implementation details, no repeating 'Thinking…'"*. A model reaches for all of them,
 * because they are what "show your progress" looks like in most training data.
 */
const BANNED: readonly RegExp[] = [
  /\d+\s*%/,
  /\bstep\s*\d/i,
  /\b\d+\s*(?:tokens?|ms|seconds?)\b/i,
  /^\s*thinking\b/i,
  /\b(?:prompt|token|endpoint|api|json|parse|payload|model call)\b/i,
];

/**
 * A model that claims a search on a turn that bought none has described a system that does not
 * exist — the most believable lie this field can carry, because it is what a working product says.
 */
const CLAIMS_SEARCH =
  /\b(search(es|ing)?|look(ing|s)? (it )?up|web|online|brows(e|ing)|check(ing)? (the )?(current|latest))\b/i;

/**
 * The milestones this turn is allowed to show, in stage order.
 *
 * 🔴 REFUSED ONE BY ONE, NOT ALL OR NOTHING. A model that wrote three good lines and one that
 * mentions percentages should lose the fourth, not the turn's whole preview — the alternative
 * punishes the learner for a wording nobody but us can see.
 *
 * 🔴 AND THE SEARCH CHECK IS HERE RATHER THAN AT DISPLAY TIME because `needsWeb` is decided in the
 * same object. By the time a stage advances, the claim has already been made.
 */
export function readMilestones(value: unknown, searching: boolean): string[] {
  if (!Array.isArray(value)) return [];
  const kept: string[] = [];
  for (const entry of value) {
    if (kept.length >= MAX_MILESTONES) break;
    if (typeof entry !== "string") continue;
    const line = entry.trim().replace(/\s+/g, " ");
    if (!line || line.length > MAX_MILESTONE_LENGTH) continue;
    if (BANNED.some((pattern) => pattern.test(line))) continue;
    if (!searching && CLAIMS_SEARCH.test(line)) continue;
    // 🔴 NO DUPLICATES. A model that repeats itself produces a preview that looks frozen, which
    // reads as a hang rather than as progress.
    if (kept.some((existing) => existing.toLowerCase() === line.toLowerCase())) continue;
    kept.push(line);
  }
  return kept;
}

/**
 * The one line to show right now, or null to show nothing.
 *
 * 🔴🔴 THE MODEL'S WORDS WHEN IT HAS THEM, THE SYSTEM'S WHEN IT DOES NOT, AND NEITHER WHEN NOTHING
 * IS RUNNING. The owner's examples are conversational — *"Checking the latest treatment
 * recommendations"* — which is a sentence only the model can write, because only it knows the
 * subject. `systemLabel` is the honest fallback for a step the model could not have anticipated: a
 * PubChem lookup, a curve being computed, pages coming back.
 *
 * 🔴 A MILESTONE IS INDEXED BY STAGE, NOT CONSUMED IN ORDER. If the model wrote three lines and the
 * turn skipped the search, stage `reading` is never entered and its line is never shown — rather
 * than sliding up to fill a stage it was not written for and describing the wrong work.
 */
export function previewLine(input: {
  readonly stage: TurnStage;
  readonly milestones: readonly string[];
  /** What the runtime knows is executing right now, when it knows something. */
  readonly systemLabel?: string | null;
  /** The answer has started arriving. Nothing further is "about to happen". */
  readonly answering?: boolean;
}): string | null {
  if (input.answering) return null;
  const index = TURN_STAGES.indexOf(input.stage);
  const milestone = index >= 0 ? input.milestones[index] : undefined;
  return milestone ?? input.systemLabel ?? null;
}

/**
 * Is this turn worth showing a preview for at all?
 *
 * 🔴 THE OWNER'S FIRST RULE, AND THE EASIEST ONE TO LOSE: *"For a simple conversational response:
 * do not show a thinking preview, answer immediately."* A greeting that flashes a line about
 * planning is worse than no line at all — it teaches a learner that the preview means nothing, and
 * then they stop reading it on the turn that mattered.
 *
 * A turn earns a preview by having WORK in it: the model stated milestones, or something real is
 * already running.
 */
export function previewWorthShowing(input: {
  readonly milestones: readonly string[];
  readonly systemLabel?: string | null;
}): boolean {
  return input.milestones.length > 0 || Boolean(input.systemLabel);
}
