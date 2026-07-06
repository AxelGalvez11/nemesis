import assert from "node:assert/strict";

import { rankPapers, scorePaper } from "./rank";
import type { PaperHit } from "./types";

const hit = (partial: Partial<PaperHit>): PaperHit => ({
  id: partial.id ?? partial.title ?? "paper",
  title: partial.title ?? "Paper",
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

const metaAnalysis = hit({
  id: "meta",
  title: "Creatine cognition systematic review and meta-analysis",
  doi: "10.1000/meta",
  pmid: "1",
  year: 2025,
  publication_types: ["Systematic Review", "Meta-Analysis"],
  source_rank: ["pubmed", "openalex"],
});

const weakMetadata = hit({
  id: "weak",
  title: "Creatine mention",
  year: 2026,
  source_rank: ["openalex"],
});

assert.ok(scorePaper(metaAnalysis, "creatine cognition") > scorePaper(weakMetadata, "creatine cognition"));

const ranked = rankPapers([weakMetadata, metaAnalysis], "creatine cognition");
assert.equal(ranked[0]?.id, "meta");
assert.ok((ranked[0]?.score ?? 0) > (ranked[1]?.score ?? 0));

console.log("evidence rank tests passed");
