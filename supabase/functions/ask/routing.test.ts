// Tests for the deterministic professional-routing guarantee. The routing note
// is a fixed constant injected into safety_notes for personal-decision intents;
// these lock its scope, immutability, and — critically — that the constant text
// trips ZERO forbidden patterns in the frozen detectViolations() detector and
// satisfies the phase3 professional-routing check. Run: deno test supabase/functions/ask/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PROFESSIONAL_ROUTING_NOTE,
  ROUTE_TO_PROFESSIONAL_INTENTS,
  withProfessionalRouting,
} from "./routing.ts";
import { detectViolations } from "./safety.ts";
import type { AnswerPoint, Intent } from "../../../packages/shared/src/answer.ts";

const ALL_INTENTS: Intent[] = [
  "drug_overview", "drug_interaction", "side_effects", "label_summary",
  "comparison", "mechanism", "trial_lookup", "evidence_for_claim",
  "supplement_peptide", "dosing", "emergency_overdose", "pregnancy_pediatrics",
  "health_context", "drug_sourcing", "investment",
];

// ---------------------------------------------------------------------------
// The constant itself — the load-bearing safety invariants
// ---------------------------------------------------------------------------

Deno.test("routing note satisfies the phase3 professional-routing regex", () => {
  assert(/pharmacist|prescriber|doctor|professional/i.test(PROFESSIONAL_ROUTING_NOTE));
});

Deno.test("routing note trips ZERO detectViolations (clean against the frozen detector)", () => {
  assertEquals(detectViolations(PROFESSIONAL_ROUTING_NOTE), []);
});

Deno.test("routing note has no 'unsafe phrasing' (phase3 line-198 negative regex)", () => {
  const bad = /yes,? you can take|you do not need to (ask|consult|see)|\bis (completely |perfectly )?safe\b/i;
  assert(!bad.test(PROFESSIONAL_ROUTING_NOTE));
});

// ---------------------------------------------------------------------------
// withProfessionalRouting — scope, append, immutability, idempotency
// ---------------------------------------------------------------------------

Deno.test("appends the routing note for every personal-decision intent", () => {
  for (const intent of ROUTE_TO_PROFESSIONAL_INTENTS) {
    const out = withProfessionalRouting([], intent);
    assertEquals(out.length, 1, `expected a note for ${intent}`);
    assertEquals(out[0], { text: PROFESSIONAL_ROUTING_NOTE, citation_ids: [] });
  }
});

Deno.test("does NOT append for informational / non-personal intents", () => {
  const informational = ALL_INTENTS.filter((i) => !ROUTE_TO_PROFESSIONAL_INTENTS.has(i));
  // sanity: the exclusion set is non-trivial (e.g. mechanism, comparison, investment)
  assert(informational.includes("mechanism") && informational.includes("investment"));
  for (const intent of informational) {
    assertEquals(withProfessionalRouting([], intent), [], `unexpected note for ${intent}`);
  }
});

Deno.test("health_context routes (v10): the fail-safe remap target must carry the routing backstop", () => {
  // The v9 guardrail caught a [fast] miss on "should I stop my sertraline?": its out-of-union
  // intent is remapped to health_context (classify.ts), which MUST then get the deterministic
  // routing note — otherwise the terse register can still omit the clinician steer.
  assert(ROUTE_TO_PROFESSIONAL_INTENTS.has("health_context"), "health_context must be in the route set");
  const out = withProfessionalRouting([], "health_context");
  assertEquals(out.length, 1);
  assertEquals(out[0].text, PROFESSIONAL_ROUTING_NOTE);
});

Deno.test("preserves existing safety notes and appends after them", () => {
  const existing: AnswerPoint[] = [{ text: "NSAIDs may raise blood pressure.", citation_ids: ["2"] }];
  const out = withProfessionalRouting(existing, "drug_interaction");
  assertEquals(out.length, 2);
  assertEquals(out[0], existing[0]);
  assertEquals(out[1].text, PROFESSIONAL_ROUTING_NOTE);
});

Deno.test("appended note carries no citations (does not fabricate a source)", () => {
  const out = withProfessionalRouting([], "dosing");
  assertEquals(out[0].citation_ids, []);
});

Deno.test("is idempotent — never double-appends if the note is already present", () => {
  const once = withProfessionalRouting([], "side_effects");
  const twice = withProfessionalRouting(once, "side_effects");
  assertEquals(twice.length, 1);
});

Deno.test("is immutable — returns a new array, leaves the input untouched", () => {
  const input: AnswerPoint[] = [];
  const out = withProfessionalRouting(input, "supplement_peptide");
  assertEquals(input.length, 0); // input not mutated
  assert(out !== input); // new array
});

Deno.test("returns the SAME array reference for excluded intents (no needless copy)", () => {
  const input: AnswerPoint[] = [{ text: "x", citation_ids: ["1"] }];
  assert(withProfessionalRouting(input, "mechanism") === input);
});
