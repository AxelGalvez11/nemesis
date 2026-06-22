// Tests for normalizeClassification — the guard against the classifier returning an intent
// OUTSIDE the union. The model is told intent is an enum, but the provider does not always
// enforce tool-arg enums, so it can put a SafetyFlag value (observed: "medication_change_request"
// on "should I stop my sertraline?") in the intent field. An out-of-union intent is silently
// unrecognized by every intent-keyed safety set (SAFETY_FLOOR_INTENTS, ROUTE_TO_PROFESSIONAL_INTENTS),
// dropping BOTH the required safety floor and the professional-routing backstop. These lock the
// fail-safe behavior that closes that gap. Run: deno test supabase/functions/ask/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeClassification } from "./classify.ts";
import { ROUTE_TO_PROFESSIONAL_INTENTS } from "./routing.ts";
import type { SafetyFlag } from "../../../packages/shared/src/answer.ts";

Deno.test("a valid intent passes through unchanged", () => {
  const out = normalizeClassification("drug_interaction", ["anticoagulant"]);
  assertEquals(out.intent, "drug_interaction");
  assertEquals(out.safety_flags, ["anticoagulant"]);
});

Deno.test("the observed leak: 'medication_change_request' in the intent field remaps + is preserved as a flag", () => {
  // The exact value the live classifier returned for "I feel better, should I just stop taking my sertraline now?".
  const out = normalizeClassification("medication_change_request", []);
  assertEquals(out.intent, "health_context");
  assert(out.safety_flags.includes("medication_change_request"), "the leaked signal must be preserved as a flag");
});

Deno.test("the remap target is wired to route (the fix holds end-to-end)", () => {
  const out = normalizeClassification("medication_change_request", []);
  assert(
    ROUTE_TO_PROFESSIONAL_INTENTS.has(out.intent),
    "the remapped intent MUST be in the routing set, else the backstop still does not fire",
  );
});

Deno.test("does not duplicate a flag that is already present", () => {
  const out = normalizeClassification("medication_change_request", ["medication_change_request"]);
  assertEquals(out.safety_flags.filter((f) => f === "medication_change_request").length, 1);
});

Deno.test("a garbage intent (not a valid flag) still fails safe to health_context, flags untouched", () => {
  const out = normalizeClassification("totally_made_up_xyz", ["insulin"]);
  assertEquals(out.intent, "health_context");
  assertEquals(out.safety_flags, ["insulin"]); // garbage is NOT added as a flag
});

Deno.test("is immutable — does not mutate the input flags array", () => {
  const input: SafetyFlag[] = ["pregnancy"];
  normalizeClassification("medication_change_request", input);
  assertEquals(input, ["pregnancy"]); // input untouched
});
