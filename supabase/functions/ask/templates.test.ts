import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CONSERVATIVE_FALLBACK_COPY,
  MEDICAL_DISCLAIMER,
  NO_SOURCE_COPY,
  SOURCING_COPY,
  STANDARD_QUESTIONS,
} from "./templates.ts";

const DOCTOR_BOT_COPY =
  /\b(doctor|pharmacist|clinician|prescriber|healthcare professional)\b|ask your|consult your|bring to a/i;

Deno.test("deterministic answer copy is framed as research, not doctor routing", () => {
  for (const copy of [
    MEDICAL_DISCLAIMER,
    SOURCING_COPY,
    NO_SOURCE_COPY,
    CONSERVATIVE_FALLBACK_COPY,
    ...STANDARD_QUESTIONS,
  ]) {
    assert(
      !DOCTOR_BOT_COPY.test(copy),
      `doctor-bot phrasing leaked into: ${copy}`,
    );
  }
});

Deno.test("fallback copy points to evidence gaps instead of personal-care handoff", () => {
  assertStringIncludes(NO_SOURCE_COPY, "reliable public source");
  assertStringIncludes(NO_SOURCE_COPY, "won't present it as established");
  assertStringIncludes(CONSERVATIVE_FALLBACK_COPY, "source-backed");
  assertStringIncludes(CONSERVATIVE_FALLBACK_COPY, "public sources");
});

Deno.test("standard follow-up prompts ask research-scoping questions", () => {
  assert(STANDARD_QUESTIONS.some((q) => /population|outcome/i.test(q)));
  assert(STANDARD_QUESTIONS.some((q) => /source type|FDA|trials|reviews/i.test(q)));
  assert(STANDARD_QUESTIONS.some((q) => /compare/i.test(q)));
});
