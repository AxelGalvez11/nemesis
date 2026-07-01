import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { understandQuery } from "./query-understanding.ts";
import { providerPriorityForIntent } from "./templates.ts";

Deno.test("white flakes hair is treated as a consumer symptom topic, not a drug-label topic", () => {
  const q = understandQuery("Why do I have white flakes in my hair?", [], "white flakes hair");
  assertEquals(q.fieldMentions, []);
  assertEquals(q.sourceQuery, "dandruff");
  assertEquals(q.normalizedTerms.includes("dandruff"), true);
  assertEquals(q.researchQuery.includes("dandruff"), true);
  assertEquals(q.researchQuery.includes("seborrheic dermatitis"), true);
});

Deno.test("general symptom evidence priority does not label-first", () => {
  assertEquals(providerPriorityForIntent("general_health" as never), ["medlineplus", "pubmed_oa", "europepmc", "clinicaltrials"]);
});
