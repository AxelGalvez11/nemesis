import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  claimEvidenceCounts,
  type DiscoveryClaim,
  type DiscoveryReport,
  discoveryTitle,
  normalizeDiscoveryClaim,
  type SuggestedStudyDesign,
} from "./discovery.ts";

Deno.test("normalizeDiscoveryClaim is stable enough for dedupe", () => {
  assertEquals(
    normalizeDiscoveryClaim(
      "  Creatine MAY improve cognition during sleep deprivation. ",
    ),
    "creatine may improve cognition during sleep deprivation",
  );
});

Deno.test("claimEvidenceCounts partitions relation directions", () => {
  const claim: DiscoveryClaim = {
    id: "claim-1",
    claim_text: "Creatine may support cognition under sleep deprivation.",
    normalized_claim: "creatine may support cognition under sleep deprivation",
    verdict: "likely",
    confidence: "low",
    evidence_grade: "weak",
    evidence: [
      {
        citation_tag: "1",
        source_id: "pubmed:1",
        relation: "supports",
        evidence_weight: 80,
      },
      {
        citation_tag: "2",
        source_id: "pubmed:2",
        relation: "partial",
        evidence_weight: 65,
      },
      {
        citation_tag: "3",
        source_id: "pubmed:3",
        relation: "conflicts",
        evidence_weight: 70,
      },
    ],
  };
  assertEquals(claimEvidenceCounts(claim), {
    supports: 1,
    partial: 1,
    mentions: 0,
    conflicts: 1,
    reviewed: 0,
  });
});

Deno.test("DiscoveryReport and SuggestedStudyDesign carry Level 4 output", () => {
  const design: SuggestedStudyDesign = {
    id: "design-1",
    design_type: "randomized_controlled_trial",
    research_question:
      "Does creatine preserve executive function during acute sleep deprivation?",
    hypothesis:
      "Creatine supplementation may preserve executive function during acute sleep deprivation by supporting brain energy metabolism.",
    population: "Adults exposed to sleep restriction.",
    intervention: "Creatine monohydrate supplementation.",
    comparator: "Placebo.",
    primary_endpoint: "Executive-function score after sleep restriction.",
    secondary_endpoints: ["Reaction time", "Working memory", "Adverse events"],
    duration: "Acute loading phase plus sleep-restriction challenge.",
    sample_size_notes:
      "Estimate after selecting the cognitive endpoint and minimum important difference.",
    safety_monitoring: ["GI tolerance", "Renal history screening"],
    feasibility: "moderate",
    ethics: "Sleep restriction should be time-limited and monitored.",
  };

  const report: DiscoveryReport = {
    project_title: discoveryTitle(
      "Create a discovery report on creatine for cognition",
    ),
    question: "Create a discovery report on creatine for cognition",
    summary: "Evidence is suggestive but limited.",
    evidence_meter: "weak",
    claims: [],
    study_characteristics: [],
    research_gaps: [],
    hypotheses: [],
    study_designs: [design],
    monitor_terms: ["creatine", "sleep deprivation", "cognition"],
    generated_at: "2026-06-28T00:00:00.000Z",
  };

  assertEquals(
    report.study_designs[0].design_type,
    "randomized_controlled_trial",
  );
});
