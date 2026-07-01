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

import { detectViolations, type Violation } from "./safety.ts";
import type { RawAnswer } from "./generate.ts";
import type { Intent, SafetyFlag } from "../../../packages/shared/src/answer.ts";

type RawPoint = RawAnswer["what_we_know"][number];

/** The model's declarative text, joined exactly as the post-filter scans it. what_contradicts (gated
 *  claim-check) is included so a contradicting-evidence point CANNOT bypass detectViolations; it defaults
 *  to [] so a normal answer's scanned text is byte-identical. */
function assembleDeclarative(raw: RawAnswer): string {
  return [
    raw.bottom_line.text,
    ...raw.what_we_know.map((p) => p.text),
    ...raw.safety_notes.map((p) => p.text),
    ...raw.what_we_do_not_know.map((p) => p.text),
    ...(raw.what_contradicts ?? []).map((p) => p.text),
  ].join("  ");
}

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
      // Gated claim-check section — salvaged identically: an offending contradicting-evidence point is
      // dropped, the clean ones kept. Undefined (a normal answer) stays effectively empty.
      what_contradicts: keepClean(raw.what_contradicts ?? []),
    },
    droppedCount,
    bottomLineViolation: violates(raw.bottom_line.text),
  };
}

// ----------------------------------------------------------------------------
// The benign-class gate.
//
// Salvage (drop an offending line, deliver the rest) is allowed ONLY for benign,
// general health/drug questions — the class the owner approved after the real bug
// ("i have acne how to fix?", intent=health_context flags=[], wrongly discarded).
// Anything the classifier marked SENSITIVE keeps the prior behavior exactly: one
// forbidden line => refuse the whole answer. Two layers:
//   - intent catches inherently-sensitive CATEGORIES (research peptides, dosing,
//     pregnancy/peds);
//   - flags catch the high-risk SPECIFICS inside otherwise-general intents (a
//     warfarin interaction carries `anticoagulant`; an insulin question `insulin`).
// The pre-generation short-circuits (emergency/overdose/self_harm/drug_sourcing)
// never reach this point, so they are intentionally NOT in the flag set.
// ----------------------------------------------------------------------------

const SENSITIVE_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  "supplement_peptide",
  "dosing",
  "pregnancy_pediatrics",
]);

const SENSITIVE_FLAGS: ReadonlySet<SafetyFlag> = new Set<SafetyFlag>([
  "pregnancy",
  "pediatric",
  "medication_change_request",
  "controlled_substance",
  "psychiatric_medication",
  "anticoagulant",
  "insulin",
  "immunosuppressant",
  "chemotherapy",
  "research_use_peptide",
]);

/** True when an answer to this (intent, flags) may be salvaged rather than refused outright. */
export function isBenignSalvageable(intent: Intent, flags: readonly SafetyFlag[]): boolean {
  if (SENSITIVE_INTENTS.has(intent)) return false;
  return !flags.some((f) => SENSITIVE_FLAGS.has(f));
}

// ----------------------------------------------------------------------------
// The full post-filter decision the orchestrator branches on. Pure + deterministic
// so the load-bearing logic (re-assembly, re-scan, fallback conditions) is unit-tested
// here instead of living inline in the orchestrator. detectViolations (safety.ts) is the
// untouched teeth; this only decides clean-vs-salvage-vs-refuse around it.
// ----------------------------------------------------------------------------

export type SafetyResolution =
  | { kind: "clean" }
  | { kind: "salvaged"; raw: RawAnswer; droppedCount: number; violations: Violation[] }
  | {
    kind: "fallback";
    reason: "not_salvageable" | "bottom_line" | "residual" | "empty_body";
    violations: Violation[];
  };

export function resolveSafety(raw: RawAnswer, opts: { salvageable: boolean }): SafetyResolution {
  // `violations` is the set the model actually emitted — carried out for logging so prod traces
  // show WHICH forbidden pattern tripped (e.g. is the prompt nudge reducing "X is safe"?).
  const violations = detectViolations(assembleDeclarative(raw));
  if (violations.length === 0) return { kind: "clean" };

  // Something tripped. Sensitive classes do not salvage — refuse the whole answer, as before.
  if (!opts.salvageable) return { kind: "fallback", reason: "not_salvageable", violations };

  const san = sanitizeAnswer(raw);
  // The headline carries the answer — if it trips, there is nothing safe to lead with.
  if (san.bottomLineViolation) return { kind: "fallback", reason: "bottom_line", violations };
  // Re-scan the SURVIVORS as assembled text: individually-clean points can still join
  // into a forbidden phrase across the boundary. This re-scan is the preserved guarantee.
  if (detectViolations(assembleDeclarative(san.raw)).length > 0) {
    return { kind: "fallback", reason: "residual", violations };
  }
  // If scrubbing left only a bare headline, a one-line medical answer reads as an
  // unsupported assertion — refuse with sources instead of delivering something thin.
  const survivingBody =
    san.raw.what_we_know.length + san.raw.safety_notes.length + san.raw.what_we_do_not_know.length +
    (san.raw.what_contradicts?.length ?? 0);
  if (survivingBody === 0) return { kind: "fallback", reason: "empty_body", violations };

  return { kind: "salvaged", raw: san.raw, droppedCount: san.droppedCount, violations };
}
