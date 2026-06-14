import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isBenignSalvageable, resolveSafety, sanitizeAnswer } from "./sanitize.ts";
import { detectViolations } from "./safety.ts";
import type { RawAnswer } from "./generate.ts";
import type { Intent, SafetyFlag } from "../../../packages/shared/src/answer.ts";

function answer(over: Partial<RawAnswer>): RawAnswer {
  return {
    bottom_line: { text: "Several evidence-based options exist for mild acne.", citations: ["1"] },
    what_we_know: [],
    what_we_do_not_know: [],
    safety_notes: [],
    questions_to_ask: [],
    evidence_grade: "moderate",
    ...over,
  };
}

// ---- sanitizeAnswer (point-level scrub) ----

Deno.test("sanitizeAnswer leaves a fully clean answer untouched", () => {
  const a = answer({
    what_we_know: [
      { text: "Studies describe benzoyl peroxide as a common first-line option.", citations: ["1"] },
      { text: "Topical retinoids can cause skin irritation early in treatment.", citations: ["2"] },
    ],
  });
  const r = sanitizeAnswer(a);
  assertEquals(r.droppedCount, 0);
  assertEquals(r.bottomLineViolation, false);
  assertEquals(r.raw.what_we_know.length, 2);
});

Deno.test("sanitizeAnswer drops ONLY the body point that trips the filter, keeps the rest", () => {
  const a = answer({
    what_we_know: [
      { text: "Studies describe adapalene as effective for mild acne.", citations: ["1"] },
      { text: "Doxycycline is completely safe for everyone.", citations: ["2"] }, // unsupported_safety_claim
      { text: "Benzoyl peroxide reduces acne-associated bacteria.", citations: ["3"] },
    ],
  });
  const r = sanitizeAnswer(a);
  assertEquals(r.droppedCount, 1);
  assertEquals(r.bottomLineViolation, false);
  assertEquals(r.raw.what_we_know.map((p) => p.citations[0]), ["1", "3"]); // bad middle point gone
  // The guarantee: the surviving assembled text is clean.
  const surviving = [r.raw.bottom_line.text, ...r.raw.what_we_know.map((p) => p.text)].join("  ");
  assertEquals(detectViolations(surviving).length, 0);
});

Deno.test("sanitizeAnswer flags a violating bottom_line as UNSALVAGEABLE (caller must full-fallback)", () => {
  const a = answer({
    bottom_line: { text: "Isotretinoin cures acne permanently.", citations: ["1"] }, // cure_claim
    what_we_know: [{ text: "Adapalene is a topical retinoid.", citations: ["1"] }],
  });
  const r = sanitizeAnswer(a);
  assertEquals(r.bottomLineViolation, true);
});

Deno.test("sanitizeAnswer also scrubs a dosing instruction from safety_notes and what_we_do_not_know", () => {
  const a = answer({
    safety_notes: [
      { text: "Take 100 mg of doxycycline twice daily.", citations: ["1"] }, // dosing_instruction
      { text: "Retinoids may increase sun sensitivity.", citations: ["2"] },
    ],
    what_we_do_not_know: [
      { text: "Long-term combination safety is not fully established.", citations: [] },
    ],
  });
  const r = sanitizeAnswer(a);
  assertEquals(r.droppedCount, 1);
  assertEquals(r.raw.safety_notes.length, 1);
  assertEquals(r.raw.what_we_do_not_know.length, 1);
});

// ---- isBenignSalvageable (the benign-class gate) ----

Deno.test("isBenignSalvageable: the REAL prod failing tuple (health_context, []) is salvageable", () => {
  // "i have acne how to fix?" came back intent=health_context, safety_flags=[] and got
  // wrongly discarded. The gate MUST let exactly this case through, or the fix re-breaks it.
  assertEquals(isBenignSalvageable("health_context", []), true);
});

Deno.test("isBenignSalvageable: general info intents with no sensitive flag are salvageable", () => {
  const benign: Intent[] = ["drug_overview", "side_effects", "drug_interaction", "mechanism", "label_summary"];
  for (const intent of benign) {
    assertEquals(isBenignSalvageable(intent, []), true, `${intent} should be salvageable`);
  }
});

Deno.test("isBenignSalvageable: inherently-sensitive intents are NOT salvageable (refuse entirely, as before)", () => {
  const sensitive: Intent[] = ["supplement_peptide", "dosing", "pregnancy_pediatrics"];
  for (const intent of sensitive) {
    assertEquals(isBenignSalvageable(intent, []), false, `${intent} should NOT be salvageable`);
  }
});

Deno.test("isBenignSalvageable: any high-risk safety flag blocks salvage even on a general intent", () => {
  const sensitiveFlags: SafetyFlag[] = [
    "pregnancy", "pediatric", "medication_change_request", "controlled_substance",
    "psychiatric_medication", "anticoagulant", "insulin", "immunosuppressant",
    "chemotherapy", "research_use_peptide",
  ];
  for (const flag of sensitiveFlags) {
    assertEquals(
      isBenignSalvageable("drug_overview", [flag]),
      false,
      `flag ${flag} should block salvage`,
    );
  }
});

Deno.test("isBenignSalvageable: a benign flag alongside a real one still blocks (any sensitive flag wins)", () => {
  assertEquals(isBenignSalvageable("drug_interaction", ["no_sources_found", "anticoagulant"]), false);
});

// ---- resolveSafety (the full deterministic decision the orchestrator branches on) ----

Deno.test("resolveSafety: a clean answer resolves to 'clean' (deliver as-is)", () => {
  const a = answer({
    what_we_know: [{ text: "Benzoyl peroxide reduces acne-associated bacteria.", citations: ["1"] }],
  });
  const r = resolveSafety(a, { salvageable: true });
  assertEquals(r.kind, "clean");
});

Deno.test("resolveSafety: benign + one offending body point => 'salvaged' (drop it, keep the rest)", () => {
  const a = answer({
    what_we_know: [
      { text: "Studies describe adapalene as effective for mild acne.", citations: ["1"] },
      { text: "Doxycycline is completely safe for everyone.", citations: ["2"] }, // trips
      { text: "Benzoyl peroxide reduces acne-associated bacteria.", citations: ["3"] },
    ],
  });
  const r = resolveSafety(a, { salvageable: true });
  assertEquals(r.kind, "salvaged");
  if (r.kind === "salvaged") {
    assertEquals(r.droppedCount, 1);
    assertEquals(r.raw.what_we_know.map((p) => p.citations[0]), ["1", "3"]);
    // GUARANTEE: nothing forbidden survives in what we hand downstream.
    const survivors = [
      r.raw.bottom_line.text,
      ...r.raw.what_we_know.map((p) => p.text),
      ...r.raw.safety_notes.map((p) => p.text),
      ...r.raw.what_we_do_not_know.map((p) => p.text),
    ].join("  ");
    assertEquals(detectViolations(survivors).length, 0);
  }
});

Deno.test("resolveSafety: NOT salvageable (sensitive class) => 'fallback' even though a scrub was possible", () => {
  const a = answer({
    what_we_know: [
      { text: "Studies describe TB-500 as effective for tendon repair.", citations: ["1"] },
      { text: "TB-500 is completely safe for everyone.", citations: ["2"] }, // trips
    ],
  });
  // Same answer, the ONLY difference is the gate. Sensitive => refuse entirely (prior behavior).
  assertEquals(resolveSafety(a, { salvageable: true }).kind, "salvaged");
  const r = resolveSafety(a, { salvageable: false });
  assertEquals(r.kind, "fallback");
  if (r.kind === "fallback") assertEquals(r.reason, "not_salvageable");
});

Deno.test("resolveSafety: violating bottom_line => 'fallback' (unsalvageable headline)", () => {
  const a = answer({
    bottom_line: { text: "Isotretinoin cures acne permanently.", citations: ["1"] }, // cure_claim
    what_we_know: [{ text: "Adapalene is a topical retinoid.", citations: ["1"] }],
  });
  const r = resolveSafety(a, { salvageable: true });
  assertEquals(r.kind, "fallback");
  if (r.kind === "fallback") assertEquals(r.reason, "bottom_line");
});

Deno.test("resolveSafety: a cross-boundary residual (two individually-clean points that join into a violation) => 'fallback'", () => {
  // Each point passes detectViolations on its own, but the joined declarative text reads
  // "...treatment is  safe and effective..." which trips unsupported_safety_claim. This is
  // exactly why the survivors MUST be re-scanned as assembled text, not just point-by-point.
  const a = answer({
    what_we_know: [
      { text: "Across the trials the treatment is", citations: ["1"] }, // clean alone
      { text: "safe and effective for most adults.", citations: ["2"] }, // clean alone
    ],
  });
  // Precondition: neither point trips individually...
  assertEquals(detectViolations(a.what_we_know[0].text).length, 0);
  assertEquals(detectViolations(a.what_we_know[1].text).length, 0);
  // ...so sanitizeAnswer drops nothing, but the joined re-scan catches it => fallback.
  const r = resolveSafety(a, { salvageable: true });
  assertEquals(r.kind, "fallback");
  if (r.kind === "fallback") assertEquals(r.reason, "residual");
});

Deno.test("resolveSafety: clean bottom_line but EVERY body point trips => 'fallback' (empty body, deliver nothing thin)", () => {
  const a = answer({
    bottom_line: { text: "Several evidence-based options exist for mild acne.", citations: ["1"] },
    what_we_know: [
      { text: "Adapalene is completely safe for everyone.", citations: ["1"] }, // trips
    ],
    safety_notes: [
      { text: "Take 100 mg of doxycycline twice daily.", citations: ["2"] }, // trips
    ],
  });
  const r = resolveSafety(a, { salvageable: true });
  assertEquals(r.kind, "fallback");
  if (r.kind === "fallback") assertEquals(r.reason, "empty_body");
});
