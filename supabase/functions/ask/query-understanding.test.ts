import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { applyReconToUnderstanding, isConsumerProductOnlyQuery, understandQuery } from "./query-understanding.ts";

Deno.test("understandQuery contextualizes Celsius as an energy drink for research search", () => {
  const q = understandQuery("is celsius lethal", [], "celsius lethal");
  assertEquals(q.sourceQuery, "Celsius energy drink");
  assertEquals(q.fieldMentions, []);
  assertEquals(q.normalizedTerms, ["Celsius energy drink"]);
  assertEquals(q.assumptions, ['Interpreting "Celsius" as Celsius energy drink.']);
  assertEquals(q.researchQuery.includes("energy drink"), true);
  assertEquals(q.researchQuery.includes("caffeine"), true);
  assertEquals(q.researchQuery.includes("toxicity"), true);
});

Deno.test("understandQuery removes consumer aliases from drug-label/openFDA mentions", () => {
  const q = understandQuery("is celsius lethal", ["celsius"], "celsius lethal");
  assertEquals(q.fieldMentions, []);
  assertEquals(q.sourceQuery, "Celsius energy drink");
});

Deno.test("understandQuery treats consumer-product ingredients as research terms, not drug-label mentions", () => {
  const q = understandQuery(
    "is Celsius energy drink dangerous or lethal because of caffeine?",
    ["celsius", "caffeine"],
    "celsius energy drink dangerous lethal caffeine",
  );
  assertEquals(q.fieldMentions, []);
  assertEquals(q.sourceQuery, "Celsius energy drink");
  assertEquals(q.hasConsumerProduct, true);
  assertEquals(isConsumerProductOnlyQuery(q), true);
});

Deno.test("understandQuery leaves true drug mentions available for field-scoped providers", () => {
  const q = understandQuery("is lisinopril safe with spironolactone", ["lisinopril", "spironolactone"], "lisinopril spironolactone");
  assertEquals(q.fieldMentions, ["lisinopril", "spironolactone"]);
  assertEquals(q.sourceQuery, "lisinopril spironolactone");
  assertEquals(q.assumptions, []);
});

Deno.test("understandQuery preserves true drug mentions inside a consumer-product question", () => {
  const q = understandQuery(
    "can I drink Celsius with lisinopril because of caffeine?",
    ["celsius", "lisinopril", "caffeine"],
    "celsius lisinopril caffeine",
  );
  assertEquals(q.fieldMentions, ["lisinopril"]);
  assertEquals(q.sourceQuery, "lisinopril");
  assertEquals(q.hasConsumerProduct, true);
  assertEquals(isConsumerProductOnlyQuery(q), false);
});

Deno.test("applyReconToUnderstanding enriches research terms without duplicating assumptions", () => {
  const q = understandQuery("is celsius lethal", ["celsius"], "celsius lethal");
  const merged = applyReconToUnderstanding(q, {
    assumptions: ['Interpreting "Celsius" as Celsius energy drink.'],
    normalized_terms: ["Celsius energy drink"],
    biomedical_terms: ["energy drink", "caffeine", "toxicity", "arrhythmia"],
    sources: [],
  });
  assertEquals(merged.assumptions, ['Interpreting "Celsius" as Celsius energy drink.']);
  assertEquals(merged.sourceQuery, "Celsius energy drink");
  assertEquals(merged.fieldMentions, []);
  assertEquals(merged.normalizedTerms, ["Celsius energy drink"]);
  assertEquals(merged.researchQuery.includes("arrhythmia"), true);
});
