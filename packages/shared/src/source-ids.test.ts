import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enrichmentKeyFor, normalizeDoi, pmidFromUrl } from "./source-ids.ts";

Deno.test("pmidFromUrl extracts a PubMed id", () => {
  assertEquals(pmidFromUrl("https://pubmed.ncbi.nlm.nih.gov/36331550/"), "36331550");
  assertEquals(pmidFromUrl("https://pubmed.ncbi.nlm.nih.gov/36331550"), "36331550");
  assertEquals(pmidFromUrl("https://europepmc.org/article/MED/36331550"), "36331550");
  assertEquals(pmidFromUrl("https://clinicaltrials.gov/study/NCT05000000"), null);
  assertEquals(pmidFromUrl(null), null);
});

Deno.test("normalizeDoi lowercases and strips prefixes", () => {
  assertEquals(normalizeDoi("https://doi.org/10.1001/JAMA.2023.1"), "10.1001/jama.2023.1");
  assertEquals(normalizeDoi("DOI: 10.1001/jama.2023.1"), "10.1001/jama.2023.1");
  assertEquals(normalizeDoi("not a doi"), null);
});

Deno.test("enrichmentKeyFor prefers pmid, else null", () => {
  assertEquals(enrichmentKeyFor({ url: "https://pubmed.ncbi.nlm.nih.gov/1234/" }), "pmid:1234");
  assertEquals(enrichmentKeyFor({ url: "https://api.fda.gov/label/x" }), null);
});
