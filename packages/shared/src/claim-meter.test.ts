import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { claimMeter, claimStrengthLabel } from "./claim-meter.ts";
import type { Citation } from "./answer.ts";

// Minimal citation fixtures (only the rigor metadata matters here).
function cite(over: Partial<Citation>): Citation {
  return {
    chunk_tag: "1",
    source_id: "s",
    source_type: "pubmed_oa",
    title: null,
    section: null,
    url: null,
    license: null,
    published_date: null,
    retrieved_at: null,
    ...over,
  };
}

Deno.test("claimMeter: a systematic review among sources => strong", () => {
  const r = claimMeter([
    cite({ evidence_role: "systematic_review" }),
    cite({ evidence_role: "clinical_trial" }),
  ]);
  assertEquals(r?.strength, "strong");
  assertEquals(r?.syntheses, 1);
  assertEquals(r?.sources, 2);
});

Deno.test("claimMeter: publication_types meta-analysis (no role) also => strong", () => {
  const r = claimMeter([cite({ publication_types: ["Meta-Analysis", "Journal Article"] })]);
  assertEquals(r?.strength, "strong");
  assertEquals(r?.syntheses, 1);
});

Deno.test("claimMeter: a single RCT / trial (no synthesis) => moderate, not strong", () => {
  const r = claimMeter([cite({ evidence_role: "randomized_trial" })]);
  assertEquals(r?.strength, "moderate");
  assertEquals(r?.trials, 1);
});

Deno.test("claimMeter: an official label => moderate and counted as a label", () => {
  const r = claimMeter([cite({ evidence_role: "official_label", source_type: "openfda" })]);
  assertEquals(r?.strength, "moderate");
  assertEquals(r?.labels, 1);
  assertEquals(r?.trials, 1); // labels are a subset of the trial-or-label (moderate) tier
});

Deno.test("claimMeter: INTERVENTIONAL study_type reads as a trial => moderate", () => {
  const r = claimMeter([cite({ study_type: "INTERVENTIONAL", trial_phase: "PHASE2" })]);
  assertEquals(r?.strength, "moderate");
});

Deno.test("claimMeter: observational / consumer-health only => limited", () => {
  assertEquals(claimMeter([cite({ evidence_role: "observational_study" })])?.strength, "limited");
  assertEquals(claimMeter([cite({ evidence_role: "consumer_health" })])?.strength, "limited");
  assertEquals(claimMeter([cite({ study_type: "OBSERVATIONAL" })])?.strength, "limited");
});

Deno.test("claimMeter: synthesis precedence — strong even when a trial is also present", () => {
  const r = claimMeter([
    cite({ evidence_role: "systematic_review" }),
    cite({ evidence_role: "randomized_trial" }),
  ]);
  assertEquals(r?.strength, "strong");
  assertEquals(r?.syntheses, 1);
  assertEquals(r?.trials, 1);
});

Deno.test("claimMeter: sources present but NO rigor metadata => unrated (positive-only, no fake grade)", () => {
  const r = claimMeter([cite({ title: "Some article" }), cite({ title: "Another" })]);
  assertEquals(r?.strength, "unrated");
  assertEquals(r?.sources, 2);
  assertEquals(r?.rationale.includes("study design not tagged"), true);
});

Deno.test("claimMeter: no cited sources => null (nothing to grade)", () => {
  assertEquals(claimMeter([]), null);
});

Deno.test("claimMeter: rationale reads honestly for a mixed set", () => {
  const r = claimMeter([
    cite({ evidence_role: "systematic_review" }),
    cite({ evidence_role: "clinical_trial" }),
    cite({ evidence_role: "clinical_trial" }),
  ]);
  assertEquals(r?.rationale, "Backed by 1 systematic review and 2 clinical trials");
});

Deno.test("claimStrengthLabel: maps each strength to a human label", () => {
  assertEquals(claimStrengthLabel("strong"), "Strong evidence");
  assertEquals(claimStrengthLabel("moderate"), "Moderate evidence");
  assertEquals(claimStrengthLabel("limited"), "Limited evidence");
  assertEquals(claimStrengthLabel("unrated"), "Cited");
});
