import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import type { Citation } from "../../../../packages/shared/src/answer.ts";
import type { ResearchReport } from "../../../../packages/shared/src/research.ts";
import { buildDiscoveryReport, describeStudyType } from "./discovery.ts";

function citation(tag: string, overrides: Partial<Citation> = {}): Citation {
  return {
    chunk_tag: tag,
    source_id: overrides.source_id ?? `source-${tag}`,
    source_type: overrides.source_type ?? "pubmed_oa",
    title: overrides.title ?? `Study ${tag}`,
    section: overrides.section ?? null,
    url: overrides.url ?? `https://example.test/${tag}`,
    license: overrides.license ?? null,
    published_date: overrides.published_date ?? "2025-01-01",
    retrieved_at: overrides.retrieved_at ?? "2026-06-28T00:00:00Z",
    publication_types: overrides.publication_types,
    study_type: overrides.study_type,
    trial_phase: overrides.trial_phase,
    evidence_weight: overrides.evidence_weight,
    support_score: overrides.support_score,
    claim_relation: overrides.claim_relation,
  };
}

function reportFixture(): ResearchReport {
  return {
    question: "Creatine for cognition in sleep-deprived adults",
    summary: "Human evidence is suggestive but limited.",
    sub_questions: [
      "What human evidence exists?",
      "What study gaps remain?",
    ],
    sections: [
      {
        heading: "Human evidence",
        points: [
          {
            text:
              "Small human studies suggest creatine may preserve some cognitive performance during sleep deprivation.",
            citation_ids: ["1", "2"],
          },
          {
            text:
              "The evidence is not yet strong enough for broad cognitive-enhancement claims.",
            citation_ids: ["2"],
          },
        ],
      },
    ],
    uncertainties: [
      {
        text: "Studies are small and use different cognitive endpoints.",
        citation_ids: [],
      },
    ],
    safety_notes: [],
    citations: [
      citation("1", {
        title: "Creatine and sleep deprivation trial",
        publication_types: ["Randomized Controlled Trial"],
        evidence_weight: 82,
        claim_relation: "supports",
      }),
      citation("2", {
        title: "Creatine cognition review",
        publication_types: ["Review"],
        support_score: 64,
        claim_relation: "partial",
      }),
    ],
    evidence_grade: "weak",
    safety_flags: [],
    claims_verified: true,
    gaps: [
      {
        dimension: "study_design",
        type: "no_rct",
        scope: "this_run",
        text:
          "No randomized controlled trial was among the sources we searched for this question.",
        denominator: {
          providers_searched: ["pubmed_oa"],
          n_sources: 2,
          retrieved_at: "2026-06-28T00:00:00Z",
        },
        corroborating_trials: [],
      },
    ],
    counts: {
      per_provider: { pubmed_oa: 2 },
      total_retrieved: 2,
      n_searches: 2,
      per_search_cap: 6,
      retrieved_at: "2026-06-28T00:00:00Z",
    },
    mode: "discovery",
  };
}

Deno.test("describeStudyType prefers systematic/review and RCT metadata over provider labels", () => {
  assertEquals(
    describeStudyType(
      citation("1", {
        publication_types: ["Meta-Analysis", "Journal Article"],
      }),
    ),
    "systematic review / meta-analysis",
  );
  assertEquals(
    describeStudyType(
      citation("2", { publication_types: ["Randomized Controlled Trial"] }),
    ),
    "randomized controlled trial",
  );
  assertEquals(
    describeStudyType(
      citation("3", {
        source_type: "clinicaltrials",
        study_type: "INTERVENTIONAL",
        trial_phase: "PHASE3",
      }),
    ),
    "interventional clinical trial (PHASE3)",
  );
  assertEquals(
    describeStudyType(citation("4", { source_type: "openfda" })),
    "official drug label",
  );
});

Deno.test("buildDiscoveryReport converts cited report points into claim cards", () => {
  const discovery = buildDiscoveryReport(
    reportFixture(),
    "2026-06-28T12:00:00.000Z",
  );

  assertEquals(
    discovery.project_title,
    "Creatine for cognition in sleep-deprived adults",
  );
  assertEquals(discovery.evidence_meter, "weak");
  assertEquals(discovery.claims.length, 2);
  assertEquals(discovery.claims[0].id, "claim-1");
  assertEquals(discovery.claims[0].evidence.map((e) => e.relation), [
    "supports",
    "partial",
  ]);
  assertEquals(discovery.claims[0].evidence.map((e) => e.evidence_weight), [
    82,
    64,
  ]);
  assertEquals(discovery.claims[1].confidence, "low");
});

Deno.test("buildDiscoveryReport carries study characteristics, gaps, hypotheses, and study designs", () => {
  const discovery = buildDiscoveryReport(
    reportFixture(),
    "2026-06-28T12:00:00.000Z",
  );

  assertEquals(discovery.study_characteristics.map((s) => s.study_type), [
    "randomized controlled trial",
    "review article",
  ]);
  assertEquals(discovery.research_gaps[0].dimension, "study_design");
  assertEquals(discovery.research_gaps[0].severity, "high");
  assertEquals(discovery.hypotheses[0].gap_id, discovery.research_gaps[0].id);
  assertEquals(
    discovery.study_designs[0].design_type,
    "randomized_controlled_trial",
  );
  assertEquals(
    discovery.study_designs[0].hypothesis,
    discovery.hypotheses[0].hypothesis,
  );
  assertEquals(discovery.monitor_terms, [
    "creatine",
    "cognition",
    "sleep deprived adults",
  ]);
});
