import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildReferenceList, formatReference } from "./citation-format.ts";
import type { Citation } from "./answer.ts";

const article: Citation = {
  chunk_tag: "2", source_id: "live:pubmed_oa:1", source_type: "pubmed_oa",
  title: "Tesamorelin in HIV lipodystrophy", section: null,
  url: "https://pubmed.ncbi.nlm.nih.gov/1/", license: "cc_by",
  published_date: "2024-01-01", retrieved_at: "2026-06-10",
  authors: ["Falutz J", "Mamputu JC"], journal: "N Engl J Med", year: "2024",
  volume: "390", issue: "2", pages: "101-110",
};

Deno.test("Vancouver journal article", () => {
  assertEquals(
    formatReference(article, "vancouver"),
    "Falutz J, Mamputu JC. Tesamorelin in HIV lipodystrophy. N Engl J Med. 2024;390(2):101-110.",
  );
});

// 8 authors → the styles diverge on author truncation (the real plain-text difference).
const manyAuthors: Citation = { ...article, authors: ["A A", "B B", "C C", "D D", "E E", "F F", "G G", "H H"] };

Deno.test("Vancouver lists the first 6 authors + et al when >6", () => {
  assertEquals(
    formatReference(manyAuthors, "vancouver"),
    "A A, B B, C C, D D, E E, F F, et al. Tesamorelin in HIV lipodystrophy. N Engl J Med. 2024;390(2):101-110.",
  );
});

Deno.test("AMA lists the first 3 authors + et al when >6", () => {
  assertEquals(
    formatReference(manyAuthors, "ama"),
    "A A, B B, C C, et al. Tesamorelin in HIV lipodystrophy. N Engl J Med. 2024;390(2):101-110.",
  );
});

Deno.test("Vancouver and AMA agree when ≤6 authors (no truncation)", () => {
  assertEquals(formatReference(article, "vancouver"), formatReference(article, "ama"));
});

Deno.test("graceful fallback when volume/issue/pages absent", () => {
  const sparse: Citation = { ...article, volume: undefined, issue: undefined, pages: undefined };
  assertEquals(
    formatReference(sparse, "vancouver"),
    "Falutz J, Mamputu JC. Tesamorelin in HIV lipodystrophy. N Engl J Med. 2024.",
  );
});

Deno.test("openFDA renders as a package insert, not a journal cite", () => {
  const label: Citation = {
    chunk_tag: "1", source_id: "s", source_type: "openfda", title: "EGRIFTA prescribing information",
    section: "warnings", url: "https://dailymed.example/x", license: "public", published_date: "2023-01-01",
    retrieved_at: "2026-06-10",
  };
  assertEquals(
    formatReference(label, "vancouver"),
    "EGRIFTA prescribing information [package insert]. https://dailymed.example/x. Accessed 2026-06-10.",
  );
});

Deno.test("ClinicalTrials renders with the NCT id", () => {
  const trial: Citation = {
    chunk_tag: "3", source_id: "live:clinicaltrials:NCT0", source_type: "clinicaltrials",
    title: "A phase 2 trial", section: null, url: "https://clinicaltrials.gov/study/NCT0",
    license: "public_domain", published_date: null, retrieved_at: "2026-06-10",
  };
  assertEquals(
    formatReference(trial, "vancouver"),
    "A phase 2 trial. ClinicalTrials.gov: NCT0. https://clinicaltrials.gov/study/NCT0.",
  );
});

Deno.test("buildReferenceList numbers in tag order", () => {
  const refs = buildReferenceList([article], "vancouver");
  assertEquals(refs[0].n, 1);
  assertEquals(refs[0].tag, "2");
});
