// Tests for the generation tool contract. The answer format is INTENT-ADAPTIVE:
// every answer always requires bottom_line + evidence_grade, the genuinely risky
// intents additionally REQUIRE substantive safety_notes (the safety floor), and
// the remaining narrative sections are OPTIONAL so a simple question
// ("what is retatrutide?") is no longer forced into the four-section skeleton.
// These lock that contract so a future edit can't silently drop the safety floor
// or re-introduce the rigid template. Run: deno test supabase/functions/ask/
import { assert, assertArrayIncludes, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateTool, PROMPT_VERSION } from "./prompts.ts";
import type { Intent } from "../../../packages/shared/src/answer.ts";

const ALL_INTENTS: Intent[] = [
  "drug_overview", "drug_interaction", "side_effects", "label_summary",
  "comparison", "mechanism", "trial_lookup", "evidence_for_claim",
  "supplement_peptide", "dosing", "emergency_overdose", "pregnancy_pediatrics",
  "health_context", "drug_sourcing", "investment",
];

// The intents that imply a personal-use / dosing / safety judgement and so MUST
// carry substantive safety content (not just the appended routing note).
const SAFETY_FLOOR: Intent[] = [
  "drug_interaction", "supplement_peptide", "dosing", "pregnancy_pediatrics",
  "side_effects", "health_context",
];

const ALWAYS_PROPS = [
  "bottom_line", "what_we_know", "what_we_do_not_know",
  "safety_notes", "questions_to_ask", "evidence_grade",
];

function required(intent: Intent): string[] {
  const params = generateTool(intent).parameters as { required?: unknown };
  assert(Array.isArray(params.required), `required must be an array for ${intent}`);
  return params.required as string[];
}

function properties(intent: Intent): Record<string, unknown> {
  const params = generateTool(intent).parameters as { properties?: Record<string, unknown> };
  return params.properties ?? {};
}

// ---------------------------------------------------------------------------
// Every answer carries the universal base (the answer + its honesty grade)
// ---------------------------------------------------------------------------

Deno.test("every intent requires bottom_line + evidence_grade", () => {
  for (const intent of ALL_INTENTS) {
    assertArrayIncludes(required(intent), ["bottom_line", "evidence_grade"], `base missing for ${intent}`);
  }
});

Deno.test("the answer tool always offers all six sections (model may fill any)", () => {
  for (const intent of ALL_INTENTS) {
    const keys = Object.keys(properties(intent));
    assertArrayIncludes(keys, ALWAYS_PROPS, `a section property is missing for ${intent}`);
  }
});

// ---------------------------------------------------------------------------
// Safety floor — risky intents must produce substantive safety_notes
// ---------------------------------------------------------------------------

Deno.test("safety-floor intents REQUIRE safety_notes", () => {
  for (const intent of SAFETY_FLOOR) {
    assertArrayIncludes(required(intent), ["safety_notes"], `safety floor missing for ${intent}`);
  }
});

Deno.test("benign intents do NOT force the four-section skeleton", () => {
  // The owner's complaint: 'what is X' always returned what-we-know / safety /
  // what-we-don't-know / questions. A benign overview must be free of that.
  const benign: Intent[] = ["drug_overview", "mechanism", "trial_lookup", "comparison", "label_summary"];
  for (const intent of benign) {
    const req = required(intent);
    assertEquals(req.includes("what_we_do_not_know"), false, `${intent} should not force what_we_do_not_know`);
    assertEquals(req.includes("questions_to_ask"), false, `${intent} should not force questions_to_ask`);
    assertEquals(req.includes("safety_notes"), false, `${intent} should not force safety_notes`);
  }
});

// ---------------------------------------------------------------------------
// bottom_line stays a cited single point; the contract bumps its version
// ---------------------------------------------------------------------------

Deno.test("bottom_line property still demands a cited point", () => {
  const bl = properties("drug_overview").bottom_line as { required?: string[] };
  assertArrayIncludes(bl.required ?? [], ["text", "citations"]);
});

Deno.test("PROMPT_VERSION follows ask-vN-DATE and is past the rigid-format v1", () => {
  // String() defeats literal-type narrowing so this stays a runtime check.
  const v = String(PROMPT_VERSION);
  assert(/^ask-v\d+-\d{4}-\d{2}-\d{2}$/.test(v), `unexpected PROMPT_VERSION shape: ${v}`);
  assert(v !== "ask-v1-2026-06-03", "bump PROMPT_VERSION when the prompt contract changes");
});
