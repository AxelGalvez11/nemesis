import assert from "node:assert/strict";

import { dedupePapers, normalizeDoi, normalizeTitle } from "./dedupe";
import type { PaperHit } from "./types";

const hit = (partial: Partial<PaperHit>): PaperHit => ({
  id: partial.id ?? partial.pmid ?? partial.doi ?? partial.title ?? "paper",
  title: partial.title ?? "Untitled paper",
  abstract: partial.abstract ?? null,
  doi: partial.doi ?? null,
  pmid: partial.pmid ?? null,
  pmcid: partial.pmcid ?? null,
  arxiv_id: partial.arxiv_id ?? null,
  year: partial.year ?? null,
  journal: partial.journal ?? null,
  authors: partial.authors ?? [],
  publication_types: partial.publication_types ?? [],
  source_rank: partial.source_rank ?? ["pubmed"],
  access_candidates: partial.access_candidates ?? [],
  metadata: partial.metadata ?? {},
});

assert.equal(normalizeDoi("https://doi.org/10.1000/ABC "), "10.1000/abc");
assert.equal(normalizeDoi("doi:10.1000/ABC"), "10.1000/abc");
assert.equal(normalizeTitle(" Berberine: glucose, trial! "), "berberine glucose trial");

const deduped = dedupePapers([
  hit({
    id: "pubmed:1",
    title: "Berberine for type 2 diabetes",
    doi: "10.1000/ABC",
    pmid: "111",
    source_rank: ["pubmed"],
    publication_types: ["Randomized Controlled Trial"],
  }),
  hit({
    id: "openalex:w1",
    title: "Berberine for type 2 diabetes",
    doi: "https://doi.org/10.1000/abc",
    journal: "Example Journal",
    source_rank: ["openalex"],
    publication_types: ["Journal Article"],
  }),
  hit({
    id: "europepmc:2",
    title: "Creatine and sleep deprivation",
    pmid: "222",
    source_rank: ["europepmc"],
  }),
]);

assert.equal(deduped.length, 2);

const merged = deduped.find((paper) => paper.doi === "10.1000/abc");
assert.ok(merged);
assert.deepEqual(merged.source_rank, ["pubmed", "openalex"]);
assert.deepEqual(merged.publication_types, [
  "Randomized Controlled Trial",
  "Journal Article",
]);
assert.equal(merged.journal, "Example Journal");
assert.equal(merged.pmid, "111");

const titleDeduped = dedupePapers([
  hit({ id: "crossref:x", title: "Semaglutide cardiovascular outcomes" }),
  hit({ id: "openalex:y", title: "semaglutide cardiovascular outcomes", source_rank: ["openalex"] }),
]);

assert.equal(titleDeduped.length, 1);
assert.deepEqual(titleDeduped[0]?.source_rank, ["pubmed", "openalex"]);

const mixedIdentifierDeduped = dedupePapers([
  hit({ id: "abstract-only", title: "Creatine cognition under sleep loss" }),
  hit({
    id: "doi-record",
    title: "Creatine cognition under sleep loss",
    doi: "10.1000/creatine",
    source_rank: ["openalex"],
  }),
]);

assert.equal(mixedIdentifierDeduped.length, 1);
assert.equal(mixedIdentifierDeduped[0]?.doi, "10.1000/creatine");
assert.deepEqual(mixedIdentifierDeduped[0]?.source_rank, ["pubmed", "openalex"]);

console.log("evidence dedupe tests passed");
