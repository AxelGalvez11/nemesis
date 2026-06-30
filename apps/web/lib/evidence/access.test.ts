import assert from "node:assert/strict";

import { isReusableFullTextLicense, resolveBestAccess } from "./access";
import type { PaperHit } from "./types";

const paper = (partial: Partial<PaperHit>): PaperHit => ({
  id: partial.id ?? "paper",
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

assert.equal(isReusableFullTextLicense("CC-BY-4.0"), true);
assert.equal(isReusableFullTextLicense("CC0"), true);
assert.equal(isReusableFullTextLicense("CC BY-NC"), false);
assert.equal(isReusableFullTextLicense(null), false);

const reusable = resolveBestAccess(
  paper({
    doi: "10.1000/example",
    abstract: "Abstract",
    access_candidates: [
      {
        status: "open_version",
        source: "unpaywall",
        full_text_url: "https://publisher.example/article",
        pdf_url: null,
        license: "closed",
        version: "publishedVersion",
        can_index: false,
        can_store_full_text: false,
        can_show_snippets: false,
        explanation: "Open page only",
      },
      {
        status: "legal_full_text",
        source: "pmc_oa",
        full_text_url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC1/",
        pdf_url: null,
        license: "CC-BY",
        version: "publishedVersion",
        can_index: true,
        can_store_full_text: true,
        can_show_snippets: true,
        explanation: "PMC OA reusable full text",
      },
    ],
  }),
);

assert.equal(reusable.status, "legal_full_text");
assert.equal(reusable.source, "pmc_oa");
assert.equal(reusable.can_index, true);

const abstractOnly = resolveBestAccess(paper({ abstract: "Only an abstract" }));
assert.equal(abstractOnly.status, "abstract_or_metadata_only");
assert.equal(abstractOnly.can_index, false);
assert.equal(abstractOnly.can_store_full_text, false);

const metadataOnly = resolveBestAccess(paper({ title: "No abstract" }));
assert.equal(metadataOnly.status, "metadata_only");

console.log("evidence access tests passed");
