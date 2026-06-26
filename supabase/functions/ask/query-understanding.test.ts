import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { understandQuery } from "./query-understanding.ts";

Deno.test("understandQuery contextualizes Celsius as an energy drink for research search", () => {
  const q = understandQuery("is celsius lethal", [], "celsius lethal");
  assertEquals(q.sourceQuery, "Celsius energy drink");
  assertEquals(q.fieldMentions, []);
  assertEquals(q.normalizedTerms, ["Celsius energy drink"]);
  assertEquals(q.assumptions, ['Interpreting "celsius" as Celsius energy drink.']);
  assertEquals(q.researchQuery.includes("energy drink"), true);
  assertEquals(q.researchQuery.includes("caffeine"), true);
  assertEquals(q.researchQuery.includes("toxicity"), true);
});

Deno.test("understandQuery removes consumer aliases from drug-label/openFDA mentions", () => {
  const q = understandQuery("is celsius lethal", ["celsius"], "celsius lethal");
  assertEquals(q.fieldMentions, []);
  assertEquals(q.sourceQuery, "Celsius energy drink");
});

Deno.test("understandQuery leaves true drug mentions available for field-scoped providers", () => {
  const q = understandQuery("is lisinopril safe with spironolactone", ["lisinopril", "spironolactone"], "lisinopril spironolactone");
  assertEquals(q.fieldMentions, ["lisinopril", "spironolactone"]);
  assertEquals(q.sourceQuery, "lisinopril spironolactone");
  assertEquals(q.assumptions, []);
});
