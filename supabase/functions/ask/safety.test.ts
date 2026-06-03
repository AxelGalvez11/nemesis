// Tests for the deterministic safety layer (no LLM). These are the
// safety-critical units: preScreen() gates BEFORE generation, detectViolations()
// gates the generated text AFTER, so a forbidden doc-20 string can never reach
// the user even if the model emits it. Run: deno test supabase/functions/ask/
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { preScreen, detectViolations } from "./safety.ts";

// ---------------------------------------------------------------------------
// preScreen — emergency / overdose / self-harm hard short-circuit
// ---------------------------------------------------------------------------

Deno.test("preScreen: overdose phrasing short-circuits to emergency", () => {
  const r = preScreen("I think I took too many metformin pills, what do I do?");
  assertEquals(r.shortCircuit, "emergency_routing");
  assert(r.flags.includes("overdose_possible"));
});

Deno.test("preScreen: explicit overdose word", () => {
  const r = preScreen("can you overdose on sertraline");
  assertEquals(r.shortCircuit, "emergency_routing");
  assert(r.flags.includes("overdose_possible"));
});

Deno.test("preScreen: medical emergency symptoms route", () => {
  const r = preScreen("I have chest pain and can't breathe after my pill");
  assertEquals(r.shortCircuit, "emergency_routing");
  assert(r.flags.includes("emergency_possible"));
});

Deno.test("preScreen: self-harm routes (and wins over nothing)", () => {
  const r = preScreen("I want to kill myself with these pills");
  assertEquals(r.shortCircuit, "emergency_routing");
  assert(r.flags.includes("self_harm"));
});

Deno.test("preScreen: sourcing refuses but does not emergency-route", () => {
  const r = preScreen("where can I buy semaglutide online without a prescription");
  assertEquals(r.shortCircuit, "sourcing_refusal");
  assert(r.flags.includes("drug_sourcing"));
});

Deno.test("preScreen: emergency wins over sourcing when both present", () => {
  const r = preScreen("I overdosed, where do I buy more");
  assertEquals(r.shortCircuit, "emergency_routing");
});

Deno.test("preScreen: a normal question does not short-circuit", () => {
  const r = preScreen("what are the major warnings for sertraline");
  assertEquals(r.shortCircuit, null);
  assertEquals(r.flags.length, 0);
});

Deno.test("preScreen: interaction question does not false-positive emergency", () => {
  const r = preScreen("can I take ibuprofen with lisinopril");
  assertEquals(r.shortCircuit, null);
});

// ---------------------------------------------------------------------------
// detectViolations — the doc-20 "must NEVER produce" list
// ---------------------------------------------------------------------------

Deno.test("detectViolations: 'yes you can take them together' is caught", () => {
  assert(detectViolations("Yes, you can take them together.").length > 0);
  assert(detectViolations("yes you can take ibuprofen and lisinopril together").length > 0);
});

Deno.test("detectViolations: 'stop taking that medication' is caught", () => {
  assert(detectViolations("You should stop taking that medication.").length > 0);
  assert(detectViolations("Discontinue using sertraline immediately.").length > 0);
});

Deno.test("detectViolations: injection/dosing instruction is caught", () => {
  assert(detectViolations("Inject 250 mcg twice weekly.").length > 0);
  assert(detectViolations("inject this amount under the skin").length > 0);
});

Deno.test("detectViolations: 'this peptide is safe' is caught", () => {
  assert(detectViolations("This peptide is safe for long-term use.").length > 0);
  assert(detectViolations("BPC-157 is completely safe.").length > 0);
});

Deno.test("detectViolations: cure claim is caught", () => {
  assert(detectViolations("This will cure your injury.").length > 0);
});

Deno.test("detectViolations: 'you do not need to ask a doctor' is caught", () => {
  assert(detectViolations("You do not need to ask a doctor about this.").length > 0);
  assert(detectViolations("You don't need to consult a physician.").length > 0);
});

// ---- negation / safe-phrasing must NOT trip the filter (no false positives) --

Deno.test("detectViolations: 'is not safe' passes (negation)", () => {
  assertEquals(detectViolations("This combination is not safe without monitoring.").length, 0);
});

Deno.test("detectViolations: conservative interaction language passes", () => {
  const ok =
    "This combination may require caution. Ask your pharmacist or prescriber before changing therapy.";
  assertEquals(detectViolations(ok).length, 0);
});

Deno.test("detectViolations: 'ask your doctor' guidance passes", () => {
  assertEquals(
    detectViolations("Always ask your doctor before starting a new medication.").length,
    0,
  );
});

Deno.test("detectViolations: label fact mentioning a dose passes", () => {
  // Reporting that a label lists a strength is not an instruction to inject/take.
  const ok = "The FDA label lists a 0.5 mg once-weekly maintenance dose for this product.";
  assertEquals(detectViolations(ok).length, 0);
});
