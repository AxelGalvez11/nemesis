// Tests for the deterministic routing guarantee. The routing note used to be a
// fixed professional-handoff note injected into safety_notes for personal-decision
// intents. PharmaOrb is now positioned as a research/evidence engine, so the note
// is a reversible no-op and the constant itself must not reintroduce doctor-bot
// phrasing. Run: deno test supabase/functions/ask/
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

Deno.test("routing note is research-tool framing, not doctor routing", () => {
  assert(/research|source-backed|personal treatment decision/i.test(PROFESSIONAL_ROUTING_NOTE));
  assert(!/pharmacist|prescriber|doctor|clinician|professional/i.test(PROFESSIONAL_ROUTING_NOTE));
});

Deno.test("routing note trips ZERO detectViolations (clean against the frozen detector)", () => {
  assertEquals(detectViolations(PROFESSIONAL_ROUTING_NOTE), []);
});

Deno.test("routing note has no 'unsafe phrasing' (phase3 line-198 negative regex)", () => {
  const bad = /yes,? you can take|you do not need to (ask|consult|see)|\bis (completely |perfectly )?safe\b/i;
  assert(!bad.test(PROFESSIONAL_ROUTING_NOTE));
});

// ---------------------------------------------------------------------------
// withProfessionalRouting — DISABLED (research-tool positioning, owner 2026-06-25)
// The deterministic "talk to your pharmacist/prescriber" note is removed from EVERY
// answer: PharmaOrb is an evidence/research tool, not a personal-medical-advice app.
// The function is kept as a reversible no-op (re-add intents to ROUTE_TO_PROFESSIONAL_INTENTS
// to restore). The "no dangerous verdicts" floor is UNAFFECTED — that is detectViolations()
// (safety.ts), a separate mechanism that still discards any "yes you can" / dose / "is safe".
// ---------------------------------------------------------------------------

Deno.test("the route set is empty — no intent gets the clinician note (research-tool positioning)", () => {
  assertEquals(ROUTE_TO_PROFESSIONAL_INTENTS.size, 0);
});

Deno.test("withProfessionalRouting appends NOTHING for ANY intent", () => {
  for (const intent of ALL_INTENTS) {
    assertEquals(withProfessionalRouting([], intent), [], `unexpected note for ${intent}`);
  }
});

Deno.test("the former personal-decision intents no longer route either (the behavior change)", () => {
  // These 7 USED to carry the note (the old backstop). After the removal they must not.
  const formerlyRouted: Intent[] = [
    "drug_overview", "drug_interaction", "side_effects",
    "supplement_peptide", "dosing", "pregnancy_pediatrics", "health_context",
  ];
  for (const intent of formerlyRouted) {
    assertEquals(withProfessionalRouting([], intent), [], `${intent} must no longer get the clinician note`);
  }
});

Deno.test("preserves existing safety notes verbatim (adds nothing, drops nothing)", () => {
  const existing: AnswerPoint[] = [{ text: "NSAIDs may raise blood pressure.", citation_ids: ["2"] }];
  for (const intent of ALL_INTENTS) {
    assertEquals(withProfessionalRouting(existing, intent), existing, `notes altered for ${intent}`);
  }
});

Deno.test("is immutable + zero-copy — returns the SAME array reference for every intent", () => {
  const input: AnswerPoint[] = [{ text: "x", citation_ids: ["1"] }];
  for (const intent of ALL_INTENTS) {
    assert(withProfessionalRouting(input, intent) === input, `needless copy for ${intent}`);
  }
  assertEquals(input.length, 1); // input never mutated
});
