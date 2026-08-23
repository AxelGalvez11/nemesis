// Reading a learner's performance for what it MEANS, and refusing to trust the reading blindly.
//
// 🔴 WHY THIS FILE IS SHAPED LIKE canvas-ops.ts.
//
// Nothing in Nemesis validates model output against the schema it was sent — the agent-tool path
// coerces instead, so a missing required field becomes an empty string and the call still reports
// success. canvas-ops.ts exists because that is unacceptable for a page that rewrites itself.
// This is the same hazard one step further in: an evaluation is model output that changes what we
// believe a learner knows, and a bad one is worse than a bad paragraph. A wrong paragraph is
// visible and the learner can argue with it. A wrong evaluation quietly retires a concept they
// never understood, or records understanding they demonstrated as a failure.
//
// One asymmetry runs through the decisions below. Refusing an evaluation costs us evidence.
// Guessing at one costs the learner a wrong verdict about their own understanding. The second is
// much more expensive, so wherever the two conflict, we refuse.
//
// Nothing here knows about scheduling. See canvas-scheduling.ts for the adapter that turns an
// evaluation into a review grade, and note the direction: evidence first, dates afterwards.

import type { ErrorType, ResponseEvaluation, Verdict } from "./canvas-model";
import { ERROR_TYPES, VERDICTS, isCognitiveMove } from "./canvas-model";
import type { CognitiveMove } from "./canvas-model";
import { extractJson } from "./canvas-parse";

/** Eight points is far more than any useful critique and far below a runaway. */
const MAX_POINTS = 8;
const MAX_POINT_CHARS = 400;
/** Feedback is the one concise thing shown to the learner, not a second lesson (§9, §20). */
const MAX_FEEDBACK_CHARS = 1_200;

export interface EvaluationContext {
  /** Every concept id this canvas declared. The judge may not name any other. */
  conceptIds: readonly string[];
}

export interface EvaluationResult {
  evaluation: ResponseEvaluation | null;
  /** What we refused and why. Surfaced for debugging and analytics, never shown to the learner
   *  as an error — a refused evaluation should read as "not assessed", not as a crash. */
  rejected: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `limit` is the length of what comes OUT, ellipsis included — otherwise "clamped to 1,200"
 *  quietly means 1,201 and every caller sizing a buffer off it is wrong by one. */
function clampText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1).trimEnd()}…` : trimmed;
}

/** A list of short points. A model that sends one string instead of a one-item array meant the
 *  same thing, so that shape is accepted — but a number or an object is not turned into text,
 *  because "42" as a thing the learner missed is noise dressed as a finding. */
function pointList(value: unknown): string[] {
  const rows = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const row of rows) {
    const point = clampText(row, MAX_POINT_CHARS);
    if (point) out.push(point);
    if (out.length >= MAX_POINTS) break;
  }
  return out;
}

function isVerdict(value: unknown): value is Verdict {
  return typeof value === "string" && (VERDICTS as readonly string[]).includes(value);
}

function errorType(value: unknown): ErrorType | undefined {
  return typeof value === "string" && (ERROR_TYPES as readonly string[]).includes(value)
    ? (value as ErrorType)
    : undefined;
}

/**
 * What a missing or unusable confidence becomes. Both extremes are assertions we have no basis
 * for, and 0 in particular would read downstream as "certainly nothing".
 *
 * 🔴 EXPORTED BECAUSE THE TRUST GATE BELOW IS DEFINED AGAINST IT, NOT AS A FACT WORTH PUBLISHING.
 * A gate at or above this number would silently reclassify every evaluation that simply OMITTED the
 * field as "no demonstration obtained" — turning a formatting habit of the model into a claim about
 * a learner. Absence of a confidence signal is not evidence of uncertainty.
 */
export const CONFIDENCE_WHEN_UNSTATED = 0.5;

function confidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return CONFIDENCE_WHEN_UNSTATED;
  return Math.min(1, Math.max(0, value));
}

/**
 * Below this, the judge is telling us it could not really tell — so its verdict may not move what
 * Nemesis believes about the learner.
 *
 * 🔴 CONFIDENCE IS A FACT ABOUT THE JUDGEMENT, NEVER A MEASURE OF THE LEARNER. Its job is to decide
 * whether a verdict counts at all. It must never weight how WELL someone did: that would mean a
 * learner who explains their reasoning accumulates systematically weaker evidence than one typing
 * bare tokens — measured, on identical objectives:
 *
 *     "valsartan"                                        confidence 0.95
 *     "that would be valsartan, the ARB it is sold as"   confidence 0.50   <- the better answer
 *
 * That inverts the north star's own worked example, where only the causal answer demonstrates
 * structure and must therefore be the STRONGER evidence. Strength of demonstration comes from what
 * the answer CONTAINED — depth, completeness, latency relative to the operation — and those are
 * recorded raw on the evidence row for a layer that can revise its mind about them.
 *
 * 🔴 SYMMETRIC, ACROSS ALL VERDICTS, AND THAT IS THE POINT RATHER THAN A SIMPLIFICATION. An
 * uncertain "correct" is exactly as unreliable as an uncertain "wrong". Gating only the verdicts
 * that would move a learner DOWN would mean believing the judge when it flatters and doubting it
 * when it does not, which is not a confidence gate — it is a thumb on the scale.
 *
 * 🔴 A STATED DEFAULT, NOT A TUNED ONE. There is no measurement behind the exact number and
 * pretending otherwise would be worse than saying so: it means "the model actively reported less
 * than 40% settled", and it is deliberately conservative, because refusing a verdict costs evidence
 * while trusting a bad one costs the learner a wrong belief about their own understanding.
 *
 * 🔴 WHAT IS NOT FREE IS THE CEILING, AND IT IS ENFORCED RATHER THAN REMEMBERED — see the assertion
 * below. Whoever revises this number may move it; they may not move it to where an unstated
 * confidence starts failing the gate.
 */
export const TRUSTED_ENOUGH_TO_UPDATE_STATE = 0.4;

// 🔴 ASSERTED AT MODULE SCOPE, THE WAY `retrieval-eligibility.ts` pins its own floor. A bound that
// lives only in a comment is a bound that a later edit steps over without noticing, and the failure
// it prevents is invisible from the outside: every evaluation that omitted `confidence` would
// quietly become "an opportunity passed and nothing was demonstrated", for every learner at once.
if (TRUSTED_ENOUGH_TO_UPDATE_STATE >= CONFIDENCE_WHEN_UNSTATED) {
  throw new Error(
    `the trust gate (${TRUSTED_ENOUGH_TO_UPDATE_STATE}) must sit strictly below the unstated-confidence default (${CONFIDENCE_WHEN_UNSTATED}), or an evaluation that simply omitted the field is read as a learner who demonstrated nothing`,
  );
}

/**
 * Is this judgement sure enough of itself to change what Nemesis believes about a learner?
 *
 * 🔴 THIS IS EVIDENCE INVARIANT 9 ONE STEP FURTHER IN. "A judge we could not reach is not a learner
 * who failed" — and a judge that reached but could not tell is much closer to unreachable than to a
 * verdict. The difference is that an outage writes nothing at all, while this writes the
 * observation and withholds only the claim.
 */
export function verdictIsTrustworthy(evaluation: { confidence: number }): boolean {
  return evaluation.confidence >= TRUSTED_ENOUGH_TO_UPDATE_STATE;
}

/** Check an evaluation the model produced, and return it only if every part of it holds up. */
export function validateEvaluation(raw: unknown, context: EvaluationContext): EvaluationResult {
  const rejected: string[] = [];
  if (!isRecord(raw)) {
    return { evaluation: null, rejected: ["the evaluation was not an object"] };
  }

  // The verdict is the load-bearing field, and the one place coercion would do real harm: a
  // model answering "correct" instead of "understood" is a formatting slip, but guessing which
  // of five states it meant risks telling someone they were wrong when they were right.
  if (!isVerdict(raw.verdict)) {
    return {
      evaluation: null,
      rejected: [`verdict ${JSON.stringify(raw.verdict)} is not one of ${VERDICTS.join(", ")}`],
    };
  }

  // 🔴 A CORRECT ANSWER LEGITIMATELY HAS NOTHING TO SAY, AND REQUIRING SOMETHING THREW IT AWAY.
  //
  // The prompt tells the judge that `feedback` must supply "exactly what was missing and nothing
  // else". When a performance is complete, nothing IS missing — so an obedient model returns an
  // empty string, and this check then discarded the whole evaluation. The learner answered
  // perfectly and was told "Nemesis couldn't read that answer", while the demonstration they had
  // just given was dropped: a right answer recorded as no evidence at all.
  //
  // So the requirement is now tied to what feedback is FOR. A verdict that fell short owes the
  // learner the missing piece, and an evaluation that cannot supply it is unusable. A passing
  // verdict owes them nothing beyond the confirmation `VERDICT_HEADLINE` already prints.
  const feedback = clampText(raw.feedback, MAX_FEEDBACK_CHARS);
  if (!feedback && !verdictIsPass(raw.verdict)) {
    return { evaluation: null, rejected: ["the evaluation had no feedback to show the learner"] };
  }

  // 🔴🔴 THE MOVE THE JUDGE CHOSE. Owner 2026-08-22: "deepseek needs to pick the next move."
  //
  // 🔴 AN UNREADABLE MOVE IS DROPPED, NEVER GUESSED, AND NEVER FATAL. `canvas-policy.ts` falls
  // back to the old ladder when this is undefined, so a model that omits the field or invents a
  // sixth option still gets the learner taught. Coercing "clarify" to "clarify_missing" is the
  // tempting version and the wrong one: the five differ in what they DO to the page, and a guess
  // here rewrites the wrong block.
  let nextMove: CognitiveMove | undefined;
  if (raw.next_move !== undefined) {
    if (isCognitiveMove(raw.next_move)) nextMove = raw.next_move;
    else rejected.push(`next_move ${JSON.stringify(raw.next_move)} is not a move; falling back to the policy`);
  }
  const moveReason = clampText(raw.move_reason, MAX_FEEDBACK_CHARS) || undefined;

  let verdict: Verdict = raw.verdict;
  const misconceptions = pointList(raw.misconceptions);
  if (verdict === "misconception" && misconceptions.length === 0) {
    // Not a refusal: both states are failures, so this cannot mark a correct answer wrong. But
    // "misconception" with no belief attached gives the teaching policy a label and nothing to
    // teach against, and `incorrect` is the honest description of what we actually know.
    verdict = "incorrect";
    rejected.push("a misconception verdict named no misconception; recorded as incorrect");
  }

  // A concept id we never issued has been invented. Keeping it would hang a weakness on the
  // diagnosis that points at nothing the learner can be shown.
  const known = new Set(context.conceptIds);
  const alsoWeak: string[] = [];
  for (const id of pointList(raw.alsoWeakConceptIds)) {
    if (known.has(id)) alsoWeak.push(id);
    else rejected.push(`concept "${id}" is not on this canvas`);
  }

  const kind = errorType(raw.errorType);
  // 🔴 AN EMPTY STRING IS "THE JUDGE DID NOT SAY", NOT A VALUE WE FAILED TO RECOGNISE. Measured in
  // production: a correct answer came back with `errorType: ""` — nothing had gone wrong, so there
  // was no kind of failure to name — and this reported `errorType "" is not one we recognise`
  // against a perfectly good reading. A rejection list that fills up with non-events is one nobody
  // reads, which is how a real rejection gets missed.
  const saidNothing = raw.errorType === undefined || (typeof raw.errorType === "string" && !raw.errorType.trim());
  if (!saidNothing && !kind) {
    rejected.push(`errorType ${JSON.stringify(raw.errorType)} is not one we recognise`);
  }

  return {
    evaluation: {
      verdict,
      confidence: confidence(raw.confidence),
      demonstrated: pointList(raw.demonstrated),
      missing: pointList(raw.missing),
      misconceptions,
      ...(kind ? { errorType: kind } : {}),
      feedback,
      ...(alsoWeak.length > 0 ? { alsoWeakConceptIds: alsoWeak } : {}),
      ...(nextMove ? { nextMove } : {}),
      ...(moveReason ? { moveReason } : {}),
    },
    rejected,
  };
}

/** The model's whole reply in, a checked evaluation out. */
export function parseEvaluation(raw: string, context: EvaluationContext): EvaluationResult {
  const json = extractJson(raw);
  if (!json) return { evaluation: null, rejected: ["no JSON object in the reply"] };
  return validateEvaluation(json, context);
}

/** Did this performance demonstrate understanding?
 *
 *  Only "strong" and "understood" do. §19 spends the learner's attention wherever understanding
 *  is not yet demonstrated, and `partial` is by definition not that — treating it as a pass
 *  would retire a concept somebody has half of, which is the exact failure the diagnosis exists
 *  to prevent. It also keeps the rule already in diagnose(): understanding is the higher bar. */
export function verdictIsPass(verdict: Verdict): boolean {
  return verdict === "strong" || verdict === "understood";
}

/** How the verdict is framed for the learner. Never a score, never "incorrect" on its own (§20) —
 *  the feedback carries the substance and this is only the sentence around it. */
export const VERDICT_HEADLINE: Record<Verdict, string> = {
  strong: "That's it. All of it.",
  understood: "That's it.",
  partial: "You have part of this.",
  incorrect: "Not quite. Here's the gap.",
  misconception: "There's a specific thing to untangle here.",
  // 🔴 PRESENT SO THE MAP IS TOTAL, NOT BECAUSE A LEARNER SHOULD EVER READ IT. `not_an_attempt` is
  // routed to conversation before any verdict screen renders; if this string is ever on screen, the
  // routing has failed and the wording should say something true rather than grade them.
  not_an_attempt: "Nemesis did not read that as an answer.",
};
