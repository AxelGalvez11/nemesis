// Tests for the generation tool contract. The answer format is INTENT-ADAPTIVE:
// every answer always requires bottom_line + evidence_grade, the genuinely risky
// intents additionally REQUIRE substantive safety_notes (the safety floor), and
// the remaining narrative sections are OPTIONAL so a simple question
// ("what is retatrutide?") is no longer forced into the four-section skeleton.
// These lock that contract so a future edit can't silently drop the safety floor
// or re-introduce the rigid template. Run: deno test supabase/functions/ask/
import { assert, assertArrayIncludes, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { BASE_GENERATE_SYSTEM, generateSystem, generateTool, PROMPT_VERSION } from "./prompts.ts";
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

// ---------------------------------------------------------------------------
// Per-mode answer register (Fast=plain / Thorough=technical). The register varies
// the WORDING only; the safety core must never vary by mode, and Deep Research —
// which builds its prompt from BASE_GENERATE_SYSTEM directly — must stay untouched.
// ---------------------------------------------------------------------------

Deno.test("the frozen base prompt carries NO per-mode style text (Deep Research stays unaffected)", () => {
  // Deep Research synthesis = BASE_GENERATE_SYSTEM + its own guidance. Keeping the style addendums OUT of
  // the base is what makes "Deep Research register is unchanged" provable rather than hopeful: the Fast/
  // Thorough variation lives only in generateSystem()'s appended block.
  assertEquals(BASE_GENERATE_SYSTEM.includes("ANSWER STYLE"), false);
});

Deno.test("GROUNDING + HARD RULES survive in BOTH registers (safety core is mode-invariant)", () => {
  for (const style of ["plain", "thorough"] as const) {
    const sys = generateSystem("drug_interaction", style);
    assert(sys.includes("GROUNDING (absolute)"), `GROUNDING missing in ${style}`);
    assert(sys.includes("HARD RULES"), `HARD RULES missing in ${style}`);
    assert(sys.includes("PHRASING"), `PHRASING rules missing in ${style}`);
  }
});

Deno.test("grounding block rides ONLY when grounded=true (default off keeps the prod prompt unchanged)", () => {
  const plain = generateSystem("drug_overview", "plain");
  const grounded = generateSystem("drug_overview", "plain", true);
  assert(!plain.includes("GROUNDING DISCIPLINE"), "default call (grounded omitted) carries no grounding block");
  assertEquals(generateSystem("drug_overview", "plain", false), plain, "grounded=false is byte-identical to the default");
  assert(grounded.includes("GROUNDING DISCIPLINE"), "grounded=true appends the grounding block");
  assert(grounded.includes("source_quote"), "grounding block tells the model to fill source_quote");
  // Safety floor must still survive AND keep the last word (grounding is inserted before it).
  assert(grounded.includes("GROUNDING (absolute)") && grounded.includes("HARD RULES"), "safety core intact under grounding");
});

// source_quote is an OPTIONAL provenance field — present in the schema but never forced (so OpenAI/
// ungrounded paths are unaffected).
Deno.test("compose_answer point schema offers optional source_quote, never required", () => {
  const tool = generateTool("drug_overview");
  // deno-lint-ignore no-explicit-any
  const props = (tool.parameters as any).properties.what_we_know.items.properties;
  assert("source_quote" in props, "point schema exposes source_quote");
  // deno-lint-ignore no-explicit-any
  const req = (tool.parameters as any).properties.what_we_know.items.required as string[];
  assert(!req.includes("source_quote"), "source_quote stays OPTIONAL (not forced on ungrounded paths)");
});

Deno.test("register selection: plain overrides, thorough is technical, absent == current behavior", () => {
  const plain = generateSystem("drug_overview", "plain");
  const thorough = generateSystem("drug_overview", "thorough");
  const def = generateSystem("drug_overview");
  // Fast/plain is the quick-gist register; it OVERRIDES the base register and instructs a genuinely short answer.
  assert(plain.includes("ANSWER STYLE — FAST / PLAIN"), "plain register must carry the fast/plain override block");
  assert(plain.includes("OVERRIDE"), "plain register must explicitly OVERRIDE the base register");
  assert(plain.includes("KEEP IT GENUINELY SHORT"), "fast register must instruct a genuinely short answer");
  // Thorough is the depth register; it must EXPLICITLY OVERRIDE the base FORMAT leanness rules (else it
  // collapses back to the lean default and reads identical to Fast) and instruct a fuller answer.
  assert(thorough.includes("ANSWER STYLE — THOROUGH"), "thorough register must carry the thorough block");
  assert(thorough.includes("OVERRIDE"), "thorough register must explicitly OVERRIDE the base leanness rules");
  assert(thorough.includes("BE GENUINELY COMPLETE"), "thorough register must instruct a fuller answer");
  // No style => byte-for-byte the pre-modes behavior (base + intent guidance, no style block).
  assertEquals(def.includes("ANSWER STYLE"), false, "absent mode must not inject a style block");
});
