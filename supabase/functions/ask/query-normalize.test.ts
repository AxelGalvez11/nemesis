// Tests for the gated typo-intent normalization pass (query-normalize.ts). The contract under
// test: acceptNormalized is a DETERMINISTIC gate on the LLM's rewrite — it may only pass through
// a same-shaped query with spelling fixed, and returns the ORIGINAL on anything that looks like
// an answer, an expansion, a truncation, a lost drug mention, a paraphrased-away safety trigger,
// or junk. The LLM can therefore never hijack retrieval.
// Run: deno test --allow-env supabase/functions/ask/
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  acceptNormalized,
  normalizeResearchQuery,
  queryNormalizeEnabled,
  shouldAttemptNormalize,
} from "./query-normalize.ts";

Deno.test("flag is OFF by default", () => {
  Deno.env.delete("QUERY_NORMALIZE");
  assertEquals(queryNormalizeEnabled(), false);
  Deno.env.set("QUERY_NORMALIZE", "on");
  assertEquals(queryNormalizeEnabled(), true);
  Deno.env.delete("QUERY_NORMALIZE");
});

Deno.test("accepts a plain typo fix (the whole point)", () => {
  assertEquals(
    acceptNormalized("whst are side effects of metfrmin", "what are side effects of metformin"),
    "what are side effects of metformin",
  );
});

Deno.test("accepts the owner's conversational-symptom case", () => {
  assertEquals(
    acceptNormalized("why is my skn so itchey", "why is my skin so itchy"),
    "why is my skin so itchy",
  );
});

Deno.test("accepts a word split within tolerance (merged typo)", () => {
  assertEquals(
    acceptNormalized("metformin sideeffects liver", "metformin side effects liver"),
    "metformin side effects liver",
  );
});

Deno.test("returns original when candidate is empty or whitespace", () => {
  assertEquals(acceptNormalized("metfrmin liver", ""), "metfrmin liver");
  assertEquals(acceptNormalized("metfrmin liver", "   \n "), "metfrmin liver");
});

Deno.test("returns original verbatim when nothing changed", () => {
  assertEquals(acceptNormalized("metformin liver", "metformin liver"), "metformin liver");
});

Deno.test("rejects an answer-shaped expansion (model tried to answer, not correct)", () => {
  const original = "is creatine bad for kidneys";
  const answer =
    "Creatine is generally considered safe for healthy kidneys, but people with kidney disease should consult a doctor before use.";
  assertEquals(acceptNormalized(original, answer), original);
});

Deno.test("rejects a rewrite that adds concepts beyond the word-count tolerance", () => {
  const original = "metformin liver";
  assertEquals(
    acceptNormalized(original, "metformin liver toxicity hepatic injury elevated enzymes safety"),
    original,
  );
});

Deno.test("rejects a truncating rewrite (dropped concepts)", () => {
  const original = "does metformin reduce cardiovascular mortality in type 2 diabetes";
  assertEquals(acceptNormalized(original, "metformin"), original);
});

Deno.test("strips code fences and surrounding quotes before judging", () => {
  assertEquals(
    acceptNormalized("metfrmin and the livr", '```\nmetformin and the liver\n```'),
    "metformin and the liver",
  );
  assertEquals(
    acceptNormalized("metfrmin and the livr", '"metformin and the liver"'),
    "metformin and the liver",
  );
});

Deno.test("collapses internal newlines/whitespace to single spaces", () => {
  assertEquals(
    acceptNormalized("metfrmin and the livr", "metformin and\nthe   liver"),
    "metformin and the liver",
  );
});

Deno.test("shouldAttemptNormalize skips degenerate and oversized queries", () => {
  assertEquals(shouldAttemptNormalize(""), false);
  assertEquals(shouldAttemptNormalize("a"), false);
  assertEquals(shouldAttemptNormalize("x".repeat(401)), false);
  assertEquals(shouldAttemptNormalize("why is my skin itchy"), true);
});

Deno.test("rejects a rewrite that loses a mustKeep drug mention (novel drug protection)", () => {
  const original = "retatrutide weight loss";
  assertEquals(
    acceptNormalized(original, "semaglutide weight loss", ["retatrutide"]),
    original,
  );
});

Deno.test("accepts a rewrite that fixes words AROUND a preserved drug mention", () => {
  assertEquals(
    acceptNormalized("retatrutide wieght los", "retatrutide weight loss", ["retatrutide"]),
    "retatrutide weight loss",
  );
});

Deno.test("mustKeep terms absent from the original do not block the rewrite", () => {
  // The classifier's mention may not appear verbatim in the processed research string.
  assertEquals(
    acceptNormalized("skn itchey", "skin itchy", ["metformin"]),
    "skin itchy",
  );
});

Deno.test("mustKeep check is case-insensitive", () => {
  assertEquals(
    acceptNormalized("Metformin and the livr", "metformin and the liver", ["Metformin"]),
    "metformin and the liver",
  );
});

Deno.test("rejects a rewrite that paraphrases away the safety-critical trigger", () => {
  // isSafetyCriticalQuery gates the FDA-enforcement + toxicology live sources downstream; a
  // same-shaped paraphrase must not be able to silently switch those sources off.
  const original = "is metformin overdose dangerous";
  assertEquals(
    acceptNormalized(original, "is metformin dosage worrisome", ["metformin"]),
    original,
  );
});

Deno.test("accepts a typo fix that KEEPS the safety-critical trigger", () => {
  assertEquals(
    acceptNormalized("is metfrmin overdose dangerus", "is metformin overdose dangerous", []),
    "is metformin overdose dangerous",
  );
});

Deno.test("accepts a typo fix that RESTORES a misspelled safety trigger", () => {
  // "overdse" doesn't trip the gate pre-fix, so no survival constraint applies — and the fixed
  // string tripping it is strictly better (turns the safety sources ON).
  assertEquals(
    acceptNormalized("metformin overdse risk", "metformin overdose risk", []),
    "metformin overdose risk",
  );
});

Deno.test("normalizeResearchQuery returns the original when the LLM call throws (fail-safe)", async () => {
  Deno.env.set("LLM_API_KEY", "test-key");
  try {
    const boom = () => Promise.reject(new Error("llm 500: down"));
    const out = await normalizeResearchQuery(
      "why is my skn itchey",
      [],
      boom as unknown as Parameters<typeof normalizeResearchQuery>[2],
    );
    assertEquals(out, "why is my skn itchey");
  } finally {
    Deno.env.delete("LLM_API_KEY");
  }
});

Deno.test("normalizeResearchQuery gates the LLM's answer through acceptNormalized", async () => {
  Deno.env.set("LLM_API_KEY", "test-key");
  try {
    const fake = () =>
      Promise.resolve({ input: { corrected: "why is my skin itchy" }, model: "fake" });
    const out = await normalizeResearchQuery(
      "why is my skn itchey",
      [],
      fake as unknown as Parameters<typeof normalizeResearchQuery>[2],
    );
    assertEquals(out, "why is my skin itchy");
  } finally {
    Deno.env.delete("LLM_API_KEY");
  }
});
