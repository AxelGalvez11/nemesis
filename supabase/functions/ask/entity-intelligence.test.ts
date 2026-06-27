import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveKnownEntities,
  resolveKnownEntity,
} from "./entity-intelligence.ts";

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

Deno.test("resolveKnownEntities normalizes white flakes into a scalp-flaking topic", () => {
  const entities = resolveKnownEntities(
    "why do I have white flakes in my hair",
    [],
  );
  assertEquals(entities.map((e) => e.normalized), ["dandruff / scalp flaking"]);
  assertEquals(entities[0]?.kind, "condition");
  assertEquals(entities[0]?.use_drug_label_lane, false);
  assertEquals(entities[0]?.biomedical_terms.includes("dandruff"), true);
  assertEquals(
    entities[0]?.biomedical_terms.includes("seborrheic dermatitis"),
    true,
  );
});

Deno.test("resolveKnownEntities does not swallow real drug mentions", () => {
  const entities = resolveKnownEntities(
    "is lisinopril safe with spironolactone",
    ["lisinopril", "spironolactone"],
  );
  assertEquals(entities, []);
});
