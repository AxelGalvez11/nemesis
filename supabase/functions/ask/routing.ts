// Deterministic professional-routing guarantee (post-citation-enforcement).
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

// Intents that imply a personal therapeutic decision (combine? dose? use? while
// pregnant? stop?). Pure-informational intents (mechanism, comparison, trial_lookup,
// investment, …) are excluded — a "talk to your prescriber" line there is a
// non-sequitur. drug_overview is included so a classifier that labels a
// borderline personal question as an overview still gets the guarantee.
// health_context is included (v10): it is BOTH inherently personal (the answer is
// applied to the user's own situation) AND the fail-safe remap target for an
// unrecognized/out-of-union intent (classify.ts normalizeClassification). Without
// it, a med-change question that classified to the out-of-union "medication_change_request"
// got no routing backstop and a terse Fast answer could omit the steer entirely.
export const ROUTE_TO_PROFESSIONAL_INTENTS: ReadonlySet<Intent> = new Set<Intent>([
  "drug_overview",
  "drug_interaction",
  "side_effects",
  "supplement_peptide",
  "dosing",
  "pregnancy_pediatrics",
  "health_context",
]);

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
