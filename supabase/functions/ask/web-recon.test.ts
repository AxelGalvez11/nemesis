import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { inferRecon, trustUrl } from "./web-recon.ts";

Deno.test("trustUrl labels .gov sources as authoritative context", () => {
  assertEquals(trustUrl("https://www.fda.gov/drugs/drug-safety-and-availability"), "authoritative_context");
});

Deno.test("trustUrl labels Wikipedia/Wikidata as entity context only", () => {
  assertEquals(trustUrl("https://en.wikipedia.org/wiki/Celsius_(drink)"), "entity_context");
  assertEquals(trustUrl("https://www.wikidata.org/wiki/Q123"), "entity_context");
});

Deno.test("inferRecon treats Celsius as a consumer-product context clue", () => {
  const r = inferRecon("is celsius lethal", []);
  assertEquals(r.assumptions, ['Interpreting "Celsius" as Celsius energy drink.']);
  assertEquals(r.normalized_terms, ["Celsius energy drink"]);
  assertEquals(r.biomedical_terms.includes("energy drink"), true);
  assertEquals(r.biomedical_terms.includes("caffeine"), true);
  assertEquals(r.biomedical_terms.includes("toxicity"), true);
});
