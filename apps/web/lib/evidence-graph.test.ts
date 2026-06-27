// Ad hoc pure-graph test:
//   pnpm --filter @pharmaorb/web exec tsx lib/evidence-graph.test.ts
import assert from "node:assert/strict";
import type { AskResponse, ResearchReport } from "@pharmabro/shared";
import { buildAskEvidenceGraph, buildEvidenceGraph } from "./evidence-graph";

const report: ResearchReport = {
  question: "Does semaglutide cause muscle loss?",
  summary: "A cited summary.",
  sub_questions: ["body composition", "strength outcomes"],
  sections: [
    {
      heading: "Body composition",
      points: [
        {
          text: "Trials report weight loss with some lean-mass loss.",
          citation_ids: ["[1]", "2", "2"],
        },
      ],
    },
    {
      heading: "Strength",
      points: [
        {
          text: "Strength outcomes are less consistently reported.",
          citation_ids: ["2"],
        },
      ],
    },
  ],
  uncertainties: [
    { text: "Long-term functional outcomes remain uncertain.", citation_ids: [] },
  ],
  safety_notes: [
    { text: "Labels include gastrointestinal adverse reactions.", citation_ids: ["3"] },
  ],
  citations: [
    {
      chunk_tag: "1",
      source_id: "s1",
      source_type: "pubmed_oa",
      title: "Semaglutide and body composition",
      section: null,
      url: "https://pubmed.ncbi.nlm.nih.gov/1/",
      license: "public",
      published_date: "2024-01-01",
      retrieved_at: "2026-06-27",
      support_level: "direct",
      evidence_role: "randomized_trial",
      evidence_weight: 90,
    },
    {
      chunk_tag: "2",
      source_id: "s2",
      source_type: "pubmed_oa",
      title: "Strength outcomes review",
      section: null,
      url: "https://pubmed.ncbi.nlm.nih.gov/2/",
      license: "public",
      published_date: "2023-01-01",
      retrieved_at: "2026-06-27",
      support_level: "partial",
      evidence_role: "review_article",
      evidence_weight: 70,
    },
    {
      chunk_tag: "3",
      source_id: "s3",
      source_type: "dailymed",
      title: "Ozempic label",
      section: "Adverse reactions",
      url: "https://dailymed.nlm.nih.gov/",
      license: "public",
      published_date: "2025-01-01",
      retrieved_at: "2026-06-27",
      support_level: "direct",
      evidence_role: "official_label",
      evidence_weight: 100,
    },
    {
      chunk_tag: "4",
      source_id: "s4",
      source_type: "openalex",
      title: "Reviewed but uncited source",
      section: null,
      url: "https://openalex.org/",
      license: "public",
      published_date: "2022-01-01",
      retrieved_at: "2026-06-27",
    },
  ],
  evidence_grade: "moderate",
  safety_flags: [],
  claims_verified: true,
};

const graph = buildEvidenceGraph(report);

assert(graph.nodes.some((n) => n.id === "report" && n.kind === "report"));
assert(graph.nodes.some((n) => n.id === "section-0" && n.label === "Body composition"));
assert(graph.nodes.some((n) => n.id === "claim-0-0" && n.kind === "claim"));
assert(graph.nodes.some((n) => n.id === "safety" && n.kind === "safety"));
assert(graph.nodes.some((n) => n.id === "gaps" && n.kind === "gap"));

assert(graph.nodes.some((n) => n.id === "source-1" && n.evidenceRole === "randomized_trial"));
assert(graph.nodes.some((n) => n.id === "source-2" && n.supportLevel === "partial"));
assert(graph.nodes.some((n) => n.id === "source-3" && n.evidenceRole === "official_label"));
assert(!graph.nodes.some((n) => n.id === "source-4"));

assert(graph.edges.some((e) => e.source === "report" && e.target === "section-0"));
assert(graph.edges.some((e) => e.source === "section-0" && e.target === "claim-0-0"));
assert(graph.edges.some((e) => e.source === "claim-0-0" && e.target === "source-1"));
assert(graph.edges.some((e) => e.source === "claim-0-0" && e.target === "source-2"));
assert.equal(
  graph.edges.filter((e) => e.source === "claim-0-0" && e.target === "source-2").length,
  1,
);
assert(graph.edges.some((e) => e.source === "safety-claim-0" && e.target === "source-3"));

const ask: AskResponse = {
  answer_id: "a1",
  intent: "health_context",
  plain_english_summary: "Dry flakes are often discussed as dandruff or scalp flaking.",
  evidence_grade: "strong",
  answer_sections: {
    what_we_know: [
      { text: "MedlinePlus describes dandruff as scalp flaking.", citation_ids: ["1"] },
      { text: "A PubMed review discusses seborrheic dermatitis.", citation_ids: ["2", "2"] },
    ],
    what_we_do_not_know: [
      { text: "This does not identify the user's exact cause.", citation_ids: [] },
    ],
    safety_notes: [],
    questions_to_ask: [],
  },
  citations: [
    {
      chunk_tag: "1",
      source_id: "a-s1",
      source_type: "medlineplus",
      title: "Dandruff",
      section: null,
      url: "https://medlineplus.gov/dandruff.html",
      license: "public",
      published_date: "2025-01-01",
      retrieved_at: "2026-06-27",
      support_level: "direct",
      evidence_role: "consumer_health",
    },
    {
      chunk_tag: "2",
      source_id: "a-s2",
      source_type: "pubmed_oa",
      title: "Seborrheic dermatitis review",
      section: null,
      url: "https://pubmed.ncbi.nlm.nih.gov/2/",
      license: "public",
      published_date: "2024-01-01",
      retrieved_at: "2026-06-27",
      support_level: "partial",
      evidence_role: "review_article",
    },
  ],
  reviewed_sources: [
    {
      chunk_tag: "R1",
      source_id: "a-s3",
      source_type: "clinicaltrials",
      title: "A reviewed trial",
      section: null,
      url: "https://clinicaltrials.gov/study/NCT1",
      license: "public",
      published_date: "2024-01-01",
      retrieved_at: "2026-06-27",
      support_level: "reviewed",
      evidence_role: "clinical_trial",
    },
  ],
  safety_flags: [],
  refused_unsupported: false,
  oldest_source_date: "2024-01-01",
};

const askGraph = buildAskEvidenceGraph(ask);

assert(askGraph.nodes.some((n) => n.id === "report" && n.label === "Ask evidence"));
assert(askGraph.nodes.some((n) => n.id === "section-cited" && n.label === "Cited claims"));
assert(askGraph.nodes.some((n) => n.id === "claim-know-0"));
assert(askGraph.nodes.some((n) => n.id === "source-1" && n.evidenceRole === "consumer_health"));
assert(askGraph.edges.some((e) => e.source === "claim-know-0" && e.target === "source-1" && e.kind === "cites"));
assert.equal(
  askGraph.edges.filter((e) => e.source === "claim-know-1" && e.target === "source-2").length,
  1,
);
assert(askGraph.nodes.some((n) => n.id === "section-reviewed" && n.label === "Also reviewed"));
assert(askGraph.nodes.some((n) => n.id === "source-R1" && n.supportLevel === "reviewed"));
assert(askGraph.edges.some((e) => e.source === "section-reviewed" && e.target === "source-R1" && e.kind === "reviewed"));

console.log("evidence-graph.test.ts OK");
