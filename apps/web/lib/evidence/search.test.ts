import assert from "node:assert/strict";

import { searchEvidence } from "./search";
import type { PaperSourceAdapter } from "./types";

const pubmed: PaperSourceAdapter = {
  name: "pubmed",
  async search() {
    return [
      {
        id: "pubmed:1",
        title: "Berberine glycemic control randomized trial",
        abstract: "A trial about berberine and glycemic outcomes.",
        doi: "10.1000/berberine",
        pmid: "123",
        pmcid: null,
        arxiv_id: null,
        year: 2024,
        journal: "Trials",
        authors: ["A Researcher"],
        publication_types: ["Randomized Controlled Trial"],
        source_rank: ["pubmed"],
        access_candidates: [],
        metadata: {},
      },
    ];
  },
};

const openalex: PaperSourceAdapter = {
  name: "openalex",
  async search() {
    return [
      {
        id: "openalex:w1",
        title: "Berberine glycemic control randomized trial",
        abstract: null,
        doi: "https://doi.org/10.1000/berberine",
        pmid: null,
        pmcid: null,
        arxiv_id: null,
        year: 2024,
        journal: null,
        authors: [],
        publication_types: ["Journal Article"],
        source_rank: ["openalex"],
        access_candidates: [],
        metadata: {},
      },
    ];
  },
};

const failing: PaperSourceAdapter = {
  name: "europepmc",
  async search() {
    throw new Error("temporary source outage");
  },
};

async function main() {
  const response = await searchEvidence("berberine glucose", {
    adapters: [pubmed, openalex, failing],
    limit: 10,
    resolveExternalAccess: false,
  });

  assert.equal(response.query, "berberine glucose");
  assert.equal(response.count, 1);
  assert.deepEqual(response.results[0]?.source_rank, ["pubmed", "openalex"]);
  assert.equal(response.results[0]?.access.status, "abstract_or_metadata_only");
  assert.equal(response.warnings.length, 1);
  assert.equal(response.warnings[0]?.source, "europepmc");

  console.log("evidence search tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
