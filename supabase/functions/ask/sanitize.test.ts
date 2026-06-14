import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sanitizeAnswer } from "./sanitize.ts";
import { detectViolations } from "./safety.ts";
import type { RawAnswer } from "./generate.ts";

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
