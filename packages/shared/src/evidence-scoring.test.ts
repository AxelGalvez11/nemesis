// TDD for the deterministic evidence-scoring core (§9). The TIER is computed
// here, by pure functions, and is NEVER touched by the LLM — the engine only
// lets the model write rationale/limitations prose. These tests ARE the spec:
// every §9 worked example plus the boundary cases that pin the squishy signals
// (findings_consistent / sample_size_adequate), which is where "deterministic +
// auditable" is won or lost. Run: deno test packages/shared/
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  tier,
  applyOverrides,
  deriveSignals,
  scoreSignals,
  extractSignals,
  parsePhase,
  ADEQUATE_ENROLLMENT,
  type EntityEvidence,
  type EvidenceSignals,
  type RawAggregates,
} from "./evidence-scoring.ts";

// Conservative baseline: no evidence, generic drug, on-label. Tests override
// only the fields under test, so each assertion reads as "these signals → tier".
function sig(p: Partial<EvidenceSignals> = {}): EvidenceSignals {
  return {
    n_meta_analysis: 0,
    n_systematic_review: 0,
    n_rct: 0,
    n_human_trials: 0,
    n_observational: 0,
    n_preclinical_only: 0,
    max_trial_phase: 0,
    results_posted: false,
    fda_approved_for_indication: false,
    dailymed_label_present: false,
    entity_type: "drug",
    approved_status: "unknown",
    is_off_label: false,
    findings_consistent: false,
    sample_size_adequate: false,
    robust_human: false,
    indirect_evidence_only: false,
    only_evidence_is_abstract: false,
    ...p,
  };
}
function raw(p: Partial<RawAggregates> = {}): RawAggregates {
  return {
    n_meta_analysis: 0,
    n_systematic_review: 0,
    n_rct: 0,
    n_human_trials: 0,
    n_observational: 0,
    n_preclinical_only: 0,
    max_trial_phase: 0,
    results_posted: false,
    max_enrollment: 0,
    fda_approved_for_indication: false,
    dailymed_label_present: false,
    entity_type: "drug",
    approved_status: "unknown",
    is_off_label: false,
    ...p,
  };
}

// ---------------------------------------------------------------------------
// tier() — the §9 ordered ladder, lowest justified tier
// ---------------------------------------------------------------------------

Deno.test("tier: no evidence at all → unknown", () => {
  assertEquals(tier(sig()), "unknown");
});

Deno.test("tier: preclinical only → very_weak", () => {
  assertEquals(tier(sig({ n_preclinical_only: 3 })), "very_weak");
});

Deno.test("tier: observational only → weak", () => {
  assertEquals(tier(sig({ n_observational: 2 })), "weak");
});

Deno.test("tier: a single human trial → moderate", () => {
  assertEquals(tier(sig({ n_human_trials: 1 })), "moderate");
});

Deno.test("tier: a lone meta-analysis cannot fall through to unknown (moderate floor)", () => {
  // §9 strengthening: any human-grade evidence floors at moderate, so a
  // synthesis with no FDA/label still scores moderate, never unknown.
  assertEquals(tier(sig({ n_meta_analysis: 1 })), "moderate");
  assertEquals(tier(sig({ n_systematic_review: 1 })), "moderate");
  assertEquals(tier(sig({ n_rct: 1 })), "moderate"); // 1 RCT, no consistency/size → moderate
});

Deno.test("tier: strong via 1 adequate RCT with consistency", () => {
  assertEquals(
    tier(sig({ n_rct: 1, sample_size_adequate: true, findings_consistent: true })),
    "strong",
  );
});

Deno.test("tier: strong via ≥2 human trials with consistency", () => {
  assertEquals(tier(sig({ n_human_trials: 2, findings_consistent: true })), "strong");
});

Deno.test("tier: RCT present but NOT consistent → only moderate", () => {
  // findings_consistent gates strong; without it, an RCT is still just moderate.
  assertEquals(
    tier(sig({ n_rct: 1, sample_size_adequate: true, findings_consistent: false })),
    "moderate",
  );
});

Deno.test("tier: very_strong needs synthesis/replication AND consistency AND (fda OR label)", () => {
  assertEquals(
    tier(sig({
      n_meta_analysis: 1,
      findings_consistent: true,
      fda_approved_for_indication: true,
    })),
    "very_strong",
  );
  assertEquals(
    tier(sig({
      n_rct: 2,
      sample_size_adequate: true,
      findings_consistent: true,
      dailymed_label_present: true,
    })),
    "very_strong",
  );
});

Deno.test("tier: synthesis + consistency but NO fda/label → strong, not very_strong", () => {
  // The regulator/label gate is what separates very_strong from strong.
  assertEquals(
    tier(sig({
      n_meta_analysis: 1,
      n_rct: 2,
      sample_size_adequate: true,
      findings_consistent: true,
      fda_approved_for_indication: false,
      dailymed_label_present: false,
    })),
    "strong",
  );
});

// ---------------------------------------------------------------------------
// applyOverrides() — §9 guardrail overrides; may ONLY lower, never raise
// ---------------------------------------------------------------------------

Deno.test("override: off-label caps very_strong at strong", () => {
  const s = sig({
    n_meta_analysis: 1,
    findings_consistent: true,
    fda_approved_for_indication: true,
    is_off_label: true,
  });
  assertEquals(tier(s), "very_strong");
  assertEquals(applyOverrides(tier(s), s), "strong");
});

Deno.test("override: no human trials + preclinical present → forced to very_weak", () => {
  const s = sig({ n_observational: 5, n_preclinical_only: 2, n_human_trials: 0 });
  assertEquals(tier(s), "weak"); // observational
  assertEquals(applyOverrides(tier(s), s), "very_weak"); // preclinical override pulls down
});

Deno.test("override: peptide without robust human evidence capped at weak", () => {
  const s = sig({
    entity_type: "peptide",
    n_human_trials: 1,
    robust_human: false,
  });
  assertEquals(tier(s), "moderate");
  assertEquals(applyOverrides(tier(s), s), "weak");
});

Deno.test("override: research_use status without robust human capped at weak", () => {
  const s = sig({ approved_status: "research_use", n_human_trials: 1, robust_human: false });
  assertEquals(applyOverrides(tier(s), s), "weak");
});

Deno.test("override: only_evidence_is_abstract caps above-moderate at moderate", () => {
  const s = sig({
    n_rct: 2,
    sample_size_adequate: true,
    findings_consistent: true,
    dailymed_label_present: true,
    only_evidence_is_abstract: true,
  });
  assertEquals(tier(s), "very_strong");
  assertEquals(applyOverrides(tier(s), s), "moderate");
});

Deno.test("override: never RAISES — unknown stays unknown under peptide cap", () => {
  // A peptide with no evidence must not be lifted to 'weak' by the cap.
  const s = sig({ entity_type: "peptide", robust_human: false });
  assertEquals(tier(s), "unknown");
  assertEquals(applyOverrides(tier(s), s), "unknown");
});

Deno.test("override: robust-human peptide is NOT capped", () => {
  const s = sig({
    entity_type: "peptide",
    n_rct: 1,
    sample_size_adequate: true,
    findings_consistent: true,
    robust_human: true,
  });
  assertEquals(tier(s), "strong");
  assertEquals(applyOverrides(tier(s), s), "strong");
});

// ---------------------------------------------------------------------------
// §9 worked examples (the acceptance anchors) — via scoreSignals(raw)
// ---------------------------------------------------------------------------

Deno.test("worked example: semaglutide for weight management (approved) → very_strong/strong", () => {
  const { tier: t } = scoreSignals(raw({
    n_meta_analysis: 2,
    n_rct: 4,
    n_human_trials: 6,
    max_enrollment: 1900,
    max_trial_phase: 3,
    results_posted: true,
    fda_approved_for_indication: true,
    dailymed_label_present: true,
    entity_type: "drug",
    approved_status: "approved",
    is_off_label: false,
  }));
  assert(t === "very_strong" || t === "strong", `expected very_strong/strong, got ${t}`);
  assertEquals(t, "very_strong");
});

Deno.test("worked example: semaglutide for gym performance (off-label claim) → unknown/weak", () => {
  // The claim is scoped to its own (sparse) evidence — no trials for that use.
  const { tier: t } = scoreSignals(raw({
    n_preclinical_only: 0,
    n_observational: 0,
    n_human_trials: 0,
    entity_type: "drug",
    approved_status: "approved",
    is_off_label: true,
  }));
  assert(t === "unknown" || t === "weak", `expected unknown/weak, got ${t}`);
});

Deno.test("worked example: BPC-157 for tendon healing (peptide, no robust human) → very_weak/unknown", () => {
  const withPreclinical = scoreSignals(raw({
    n_preclinical_only: 4,
    n_human_trials: 0,
    entity_type: "peptide",
    approved_status: "research_use",
  }));
  assertEquals(withPreclinical.tier, "very_weak");

  const noEvidence = scoreSignals(raw({
    entity_type: "peptide",
    approved_status: "research_use",
  }));
  assertEquals(noEvidence.tier, "unknown");
});

// ---------------------------------------------------------------------------
// deriveSignals() — the squishy-signal computations (conservative defaults)
// ---------------------------------------------------------------------------

Deno.test("deriveSignals: findings_consistent true via synthesis / replication / approval", () => {
  assert(deriveSignals(raw({ n_meta_analysis: 1 })).findings_consistent);
  assert(deriveSignals(raw({ n_systematic_review: 1 })).findings_consistent);
  assert(deriveSignals(raw({ n_rct: 2 })).findings_consistent);
  assert(deriveSignals(raw({ fda_approved_for_indication: true })).findings_consistent);
});

Deno.test("deriveSignals: findings_consistent false for a single RCT with no synthesis/approval", () => {
  assertEquals(deriveSignals(raw({ n_rct: 1 })).findings_consistent, false);
});

Deno.test("deriveSignals: sample_size_adequate gated on the enrollment threshold", () => {
  assertEquals(deriveSignals(raw({ max_enrollment: ADEQUATE_ENROLLMENT - 1 })).sample_size_adequate, false);
  assert(deriveSignals(raw({ max_enrollment: ADEQUATE_ENROLLMENT })).sample_size_adequate);
});

Deno.test("deriveSignals: sample_size_adequate false when enrollment unknown (0)", () => {
  assertEquals(deriveSignals(raw({ max_enrollment: 0 })).sample_size_adequate, false);
});

Deno.test("deriveSignals: robust_human via adequate RCT or ≥2 human trials", () => {
  assert(deriveSignals(raw({ n_rct: 1, max_enrollment: 500 })).robust_human);
  assert(deriveSignals(raw({ n_human_trials: 2 })).robust_human);
  assertEquals(deriveSignals(raw({ n_rct: 1, max_enrollment: 10 })).robust_human, false);
});

Deno.test("deriveSignals: reserved heuristics default false (no shaky detector)", () => {
  const s = deriveSignals(raw({ n_meta_analysis: 1, n_observational: 3 }));
  assertEquals(s.only_evidence_is_abstract, false);
  assertEquals(s.indirect_evidence_only, false);
});

// ---------------------------------------------------------------------------
// extractSignals() — projections → raw aggregates
// ---------------------------------------------------------------------------

function ev(p: Partial<EntityEvidence> = {}): EntityEvidence {
  return { entity_type: "drug", approved_status: "unknown", label_count: 0, trials: [], pubmed: [], ...p };
}

Deno.test("extractSignals: counts interventional vs observational trials", () => {
  const s = extractSignals(ev({
    trials: [
      { study_type: "INTERVENTIONAL", phase: "PHASE3", enrollment: 500, results_first_posted: "2023-01-01" },
      { study_type: "INTERVENTIONAL", phase: "PHASE2", enrollment: 80, results_first_posted: null },
      { study_type: "OBSERVATIONAL", phase: "NA", enrollment: 1000, results_first_posted: null },
    ],
  }));
  assertEquals(s.n_human_trials, 2);
  assertEquals(s.n_observational, 1);
  assertEquals(s.max_trial_phase, 3);
  assertEquals(s.max_enrollment, 500); // max over INTERVENTIONAL only
  assertEquals(s.results_posted, true);
});

Deno.test("extractSignals: classifies PubMed publication types", () => {
  const s = extractSignals(ev({
    pubmed: [
      { publication_types: ["Journal Article", "Randomized Controlled Trial"], mesh_terms: ["Humans"] },
      { publication_types: ["Meta-Analysis"], mesh_terms: ["Humans"] },
      { publication_types: ["Systematic Review"], mesh_terms: ["Humans"] },
      { publication_types: ["Journal Article"], mesh_terms: ["Animals", "Rats"] }, // preclinical
    ],
  }));
  assertEquals(s.n_rct, 1);
  assertEquals(s.n_meta_analysis, 1);
  assertEquals(s.n_systematic_review, 1);
  assertEquals(s.n_preclinical_only, 1);
});

Deno.test("extractSignals: animal+human article is NOT preclinical-only", () => {
  const s = extractSignals(ev({
    pubmed: [{ publication_types: ["Journal Article"], mesh_terms: ["Animals", "Humans"] }],
  }));
  assertEquals(s.n_preclinical_only, 0);
});

Deno.test("extractSignals: approval + label flags from entity fields", () => {
  const approved = extractSignals(ev({ approved_status: "approved", label_count: 2 }));
  assertEquals(approved.fda_approved_for_indication, true);
  assertEquals(approved.dailymed_label_present, true);
  const research = extractSignals(ev({ approved_status: "research_use", label_count: 0 }));
  assertEquals(research.fda_approved_for_indication, false);
  assertEquals(research.dailymed_label_present, false);
});

Deno.test("extractSignals → scoreSignals: an approved drug with RCTs + label scores high", () => {
  const e = ev({
    entity_type: "drug",
    approved_status: "approved",
    label_count: 1,
    trials: [{ study_type: "INTERVENTIONAL", phase: "PHASE3", enrollment: 1200, results_first_posted: "2022-01-01" }],
    pubmed: [
      { publication_types: ["Randomized Controlled Trial"], mesh_terms: ["Humans"] },
      { publication_types: ["Randomized Controlled Trial"], mesh_terms: ["Humans"] },
      { publication_types: ["Meta-Analysis"], mesh_terms: ["Humans"] },
    ],
  });
  assertEquals(scoreSignals(extractSignals(e)).tier, "very_strong");
});

// ---------------------------------------------------------------------------
// parsePhase() — CT.gov v2 phase string → ordinal
// ---------------------------------------------------------------------------

Deno.test("parsePhase: maps CT.gov phase strings to an ordinal", () => {
  assertEquals(parsePhase("PHASE4"), 4);
  assertEquals(parsePhase("PHASE3"), 3);
  assertEquals(parsePhase("PHASE2"), 2);
  assertEquals(parsePhase("PHASE1"), 1);
  assertEquals(parsePhase("EARLY_PHASE1"), 1);
  assertEquals(parsePhase("NA"), 0);
  assertEquals(parsePhase(null), 0);
  assertEquals(parsePhase(""), 0);
  // multi-phase trials are stored pipe-joined (backfill) → take the HIGHEST.
  assertEquals(parsePhase("PHASE2|PHASE3"), 3);
  assertEquals(parsePhase("PHASE1|PHASE2"), 2);
});
