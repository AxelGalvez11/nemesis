// Reading a free-text answer for what it MEANS, and refusing to trust the reading blindly.
//
// 🔴 WHY THIS FILE IS SHAPED LIKE canvas-ops.ts.
//
// Nothing in Nemesis validates model output against the schema it was sent — the agent-tool path
// coerces instead, so a missing required field becomes an empty string and the call still reports
// success. canvas-ops.ts exists because that is unacceptable for a page that rewrites itself.
// This is the same hazard one step further in: a judgement is model output that changes what we
// believe a learner knows, and a bad one is worse than a bad paragraph. A wrong paragraph is
// visible and the learner can argue with it. A wrong judgement quietly retires a concept they
// never understood, or marks understanding they demonstrated as a failure.
//
// So the rule here is the same one: the judgement only changes state in ways we allow, and
// anything we cannot verify is refused rather than patched into shape.
//
// One asymmetry runs through the decisions below. Refusing a judgement costs us evidence.
// Guessing at one costs the learner a wrong verdict about their own understanding. The second is
// much more expensive, so wherever the two conflict, we refuse.

import type { ResponseJudgement, Verdict } from "./canvas-model";
import { VERDICTS } from "./canvas-model";
import { extractJson } from "./canvas-parse";

/** Eight points is far more than any useful answer critique and far below a runaway. */
const MAX_POINTS = 8;
const MAX_POINT_CHARS = 400;
/** A refinement is meant to be the short targeted correction, not a second lesson (§20). */
const MAX_REFINEMENT_CHARS = 1_200;

export interface JudgeContext {
  /** Every concept id this canvas declared. The judge may not name any other. */
  conceptIds: readonly string[];
}

export interface JudgeResult {
  judgement: ResponseJudgement | null;
  /** What we refused and why. Surfaced for debugging and analytics, never shown to the learner
   *  as an error — a rejected judgement should read as "not assessed", not as a crash. */
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

/** Check a judgement the model produced, and return it only if every part of it holds up. */
export function validateJudgement(raw: unknown, context: JudgeContext): JudgeResult {
  const rejected: string[] = [];
  if (!isRecord(raw)) {
    return { judgement: null, rejected: ["the judgement was not an object"] };
  }

  // The verdict is the load-bearing field, and the one place coercion would do real harm: a
  // model answering "correct" instead of "understood" is a formatting slip, but guessing which
  // of four states it meant risks telling someone they were wrong when they were right.
  if (!isVerdict(raw.verdict)) {
    return {
      judgement: null,
      rejected: [`verdict ${JSON.stringify(raw.verdict)} is not one of ${VERDICTS.join(", ")}`],
    };
  }

  const refinement = clampText(raw.refinement, MAX_REFINEMENT_CHARS);
  if (!refinement) {
    return { judgement: null, rejected: ["the judgement had no refinement to show the learner"] };
  }

  let verdict: Verdict = raw.verdict;
  let misconception: string | undefined;
  if (verdict === "misconception") {
    misconception = clampText(raw.misconception, MAX_POINT_CHARS) || undefined;
    if (!misconception) {
      // Not a refusal: both states are failures, so this cannot mark a correct answer wrong.
      // But "misconception" with no belief attached gives the page a label and nothing to teach
      // against, and `incorrect` is the honest description of what we actually know.
      verdict = "incorrect";
      rejected.push("a misconception verdict named no misconception; recorded as incorrect");
    }
  } else if (raw.misconception !== undefined) {
    rejected.push(`misconception text dropped: verdict was ${verdict}, not misconception`);
  }

  // A concept id we never issued has been invented. Keeping it would hang a weakness on the
  // diagnosis that points at nothing the learner can be shown.
  const known = new Set(context.conceptIds);
  const alsoWeak: string[] = [];
  for (const id of pointList(raw.alsoWeakConceptIds)) {
    if (known.has(id)) alsoWeak.push(id);
    else rejected.push(`concept "${id}" is not on this canvas`);
  }

  return {
    judgement: {
      verdict,
      got: pointList(raw.got),
      missing: pointList(raw.missing),
      ...(misconception ? { misconception } : {}),
      refinement,
      ...(alsoWeak.length > 0 ? { alsoWeakConceptIds: alsoWeak } : {}),
    },
    rejected,
  };
}

/** The model's whole reply in, a checked judgement out. */
export function parseJudgement(raw: string, context: JudgeContext): JudgeResult {
  const json = extractJson(raw);
  if (!json) return { judgement: null, rejected: ["no JSON object in the reply"] };
  return validateJudgement(json, context);
}

/** Did this answer demonstrate understanding?
 *
 *  Only "understood" does. §19 spends the learner's attention wherever understanding is not yet
 *  demonstrated, and `partial` is by definition not that — treating it as a pass would retire a
 *  concept somebody has half of, which is the exact failure the diagnosis exists to prevent.
 *  It also keeps the rule already in diagnose(): understanding is the higher bar. */
export function verdictIsPass(verdict: Verdict): boolean {
  return verdict === "understood";
}

/** How the verdict is said to the learner. Never a score, never "incorrect" on its own (§20) —
 *  the refinement carries the substance and this is only the frame around it. */
export const VERDICT_HEADLINE: Record<Verdict, string> = {
  understood: "That's it.",
  partial: "You have part of this.",
  incorrect: "Not quite — let's fix it.",
  misconception: "There's a specific thing to untangle here.",
};
