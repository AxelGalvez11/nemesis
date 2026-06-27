import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveKnownEntities, resolveKnownEntity } from "./entity-intelligence.ts";

Deno.test("resolveKnownEntity recognizes Celsius and keeps it out of the drug-label lane", () => {
  const e = resolveKnownEntity("celsius");
  assertEquals(e?.normalized, "Celsius energy drink");
  assertEquals(e?.kind, "consumer_product");
  assertEquals(e?.use_drug_label_lane, false);
  assertEquals(e?.biomedical_terms.includes("caffeine"), true);
});

Deno.test("resolveKnownEntities finds consumer products from question text and mentions", () => {
  const fromQuestion = resolveKnownEntities("is celsius lethal", []);
  const fromMention = resolveKnownEntities("is it lethal", ["celcius"]);
  assertEquals(fromQuestion.map((e) => e.normalized), ["Celsius energy drink"]);
  assertEquals(fromMention.map((e) => e.normalized), ["Celsius energy drink"]);
});

Deno.test("resolveKnownEntities does not swallow real drug mentions", () => {
  const entities = resolveKnownEntities("is lisinopril safe with spironolactone", ["lisinopril", "spironolactone"]);
  assertEquals(entities, []);
});
