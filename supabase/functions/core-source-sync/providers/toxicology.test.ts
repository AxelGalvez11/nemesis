import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildToxicologySource, toxicologyConfigured } from "./toxicology.ts";

Deno.test("toxicologyConfigured requires an allowlisted source URL", () => {
  assertEquals(toxicologyConfigured(undefined), false);
  assertEquals(toxicologyConfigured("https://example.com/tox"), false);
  assertEquals(toxicologyConfigured("https://medlineplus.gov/caffeine.html"), true);
  assertEquals(toxicologyConfigured("https://www.ncbi.nlm.nih.gov/books/NBK499974/"), true);
});

Deno.test("buildToxicologySource creates a context source from configured public text", async () => {
  const source = await buildToxicologySource({
    query: "caffeine toxicity",
    title: "Caffeine toxicology",
    sourceUrl: "https://www.ncbi.nlm.nih.gov/books/NBK499974/",
    text: "Caffeine toxicity can cause tachycardia and arrhythmias.",
  });

  assertEquals(source.provider, "nih");
  assertEquals(source.provider_id, "toxicology:caffeine-toxicity");
  assertEquals(source.license, "public_domain");
  assertEquals(source.metadata.source, "toxicology");
});
