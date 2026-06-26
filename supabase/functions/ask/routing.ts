// Deterministic professional-routing backstop (post-citation-enforcement).
//
// CURRENTLY DISABLED (research-tool positioning, 2026-06-25): ROUTE_TO_PROFESSIONAL_INTENTS is empty,
// so withProfessionalRouting() is a no-op and no answer carries the clinician-steer note. The history
// below is kept because the mechanism is intentionally reversible (re-add intents to re-enable).
//
// The generate system prompt instructs the model to route personal decisions to
// a licensed professional, but generation models (especially smaller ones)
// under-emit that line — phase3-validate caught gpt-4.1-mini answering a drug
// interaction without it. For the intents that squarely imply a personal
// medication decision, GUARANTEE a routing safety note instead of trusting the
// model: a template-style backstop, keyed on the classified intent.
//
// WHY post-enforcement: an uncited safety note is dropped by enforceCitations()
// (citation.ts keepCited filters citation_ids.length > 0), so the note is added
// to the FINAL sections in the orchestrator, after citation enforcement — not in
// generate.ts, where it would be stripped. The deterministic safety layer
// (safety.ts) stays the teeth; this only adds a guaranteed, source-free guidance
// line whose text is a fixed constant verified clean against detectViolations()
// (see routing.test.ts).

import type { AnswerPoint, Intent } from "../../../packages/shared/src/answer.ts";

// DISABLED — research-tool positioning (owner decision, 2026-06-25).
//
// This set was the intents that got a deterministic "talk to your pharmacist/prescriber" note.
// It is now EMPTY: PharmaOrb is an evidence/research tool, not a personal-medical-advice app, so
// the clinician-steer boilerplate is removed from every answer (the "doctor-gpt" tell). Liability
// cover moves to a one-time Terms-of-Service acceptance at signup + a light standing in-product
// disclaimer (separate work), not a per-answer line.
//
// IMPORTANT — what this does NOT remove: the "no dangerous verdicts" floor is a SEPARATE mechanism
// (detectViolations() in safety.ts) that still discards any "yes you can take them together",
// dosing instruction, or "X is safe" claim before it can reach the user. Removing the steer note
// does not weaken that — it only drops the advisory pointer, not the deterministic refusal teeth.
//
// REVERSIBLE: re-add intents here to restore the backstop for those question types.
export const ROUTE_TO_PROFESSIONAL_INTENTS: ReadonlySet<Intent> = new Set<Intent>([]);

// INVARIANT: this text MUST pass detectViolations() (zero forbidden patterns).
// It is appended post-enforcement, after the runtime safety scan (index.ts ~§6a),
// so it is NEVER scanned at request time — routing.test.ts is its only guard, and
// unit.yml keeps that test in CI. Keep both if you edit this string.
export const PROFESSIONAL_ROUTING_NOTE =
  "For your specific situation, talk to your pharmacist or prescriber. This is " +
  "educational information from public sources, not personal medical advice.";

/**
 * Guarantee a professional-routing safety note for personal-decision intents.
 * Pure + immutable: returns the notes unchanged for other intents, otherwise a
 * new array with the routing note appended. Idempotent (never double-appends).
 */
export function withProfessionalRouting(
  safetyNotes: AnswerPoint[],
  intent: Intent,
): AnswerPoint[] {
  if (!ROUTE_TO_PROFESSIONAL_INTENTS.has(intent)) return safetyNotes;
  if (safetyNotes.some((n) => n.text === PROFESSIONAL_ROUTING_NOTE)) return safetyNotes;
  return [...safetyNotes, { text: PROFESSIONAL_ROUTING_NOTE, citation_ids: [] }];
}
