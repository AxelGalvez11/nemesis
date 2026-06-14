// Salvage step (runs ONLY when detectViolations flags the generated answer).
//
// Before: a single forbidden sentence anywhere in the answer made the orchestrator discard the
// WHOLE cited answer and return a canned refusal — so a good, source-grounded reply to a benign
// health question ("i have acne how to fix?") was thrown away because one line happened to read
// "X is safe" / "cures Y" / a dose.
//
// This removes ONLY the offending body points (scanning each point in isolation), leaving the rest.
// It does NOT weaken the post-filter guarantee: the caller MUST re-run detectViolations on the
// surviving assembled text and full-fallback if anything still trips. The bottom_line is the
// headline answer — if IT trips, the answer is not salvageable and the caller discards as before.
// PURE + deterministic (unit-tested); the safety logic itself (safety.ts) is untouched.

import { detectViolations } from "./safety.ts";
import type { RawAnswer } from "./generate.ts";

type RawPoint = RawAnswer["what_we_know"][number];

export interface SanitizeResult {
  /** The answer with body points that individually trip detectViolations removed. */
  raw: RawAnswer;
  /** How many points were dropped (for logging / observability). */
  droppedCount: number;
  /** The bottom_line itself trips — not salvageable; the caller should full-fallback. */
  bottomLineViolation: boolean;
}

const violates = (text: string): boolean => detectViolations(text).length > 0;

export function sanitizeAnswer(raw: RawAnswer): SanitizeResult {
  let droppedCount = 0;
  const keepClean = (points: RawPoint[]): RawPoint[] =>
    points.filter((p) => {
      if (violates(p.text)) {
        droppedCount++;
        return false;
      }
      return true;
    });

  return {
    raw: {
      ...raw,
      what_we_know: keepClean(raw.what_we_know),
      safety_notes: keepClean(raw.safety_notes),
      what_we_do_not_know: keepClean(raw.what_we_do_not_know),
    },
    droppedCount,
    bottomLineViolation: violates(raw.bottom_line.text),
  };
}
