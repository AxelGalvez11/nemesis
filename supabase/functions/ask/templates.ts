// Canned copy (verbatim doc-18 / doc-20) + intent->provider retrieval priority.
// These are the deterministic answer paths: emergency routing, sourcing refusal,
// and no-source refusal never touch the generator.

import type { Intent } from "../../../packages/shared/src/answer.ts";

/** doc-18 medical disclaimer — rides on every answer. */
export const MEDICAL_DISCLAIMER =
  "PharmaOrb provides cited biomedical research from public sources such as FDA labels, " +
  "DailyMed, PubMed, and ClinicalTrials.gov. It does not diagnose, prescribe, or make " +
  "personal treatment decisions.";

/** doc-18 / doc-20 emergency routing — verbatim. */
export const EMERGENCY_COPY =
  "This could be urgent. If you may be experiencing a medical emergency, call emergency " +
  "services now. For possible poisoning or overdose in the U.S., contact Poison Control at " +
  "1-800-222-1222.\n\nI can provide general educational information after immediate safety is addressed.";

/** doc-20 drug-sourcing refusal — refuse to source, offer education only. */
export const SOURCING_COPY =
  "I can't help with finding, buying, or sourcing medications or research compounds. " +
  "I can summarize what a compound is, what the evidence says, its regulatory context, " +
  "and source-backed safety signals.";

/** doc-20 no-source refusal — evidence-gap forward. Helpful tone: it's general information, not a refusal to engage. */
export const NO_SOURCE_COPY =
  "I couldn't find a reliable public source for that specific point, so I won't present it as " +
  "established evidence. I can still show adjacent sources, explain what is known, or help narrow " +
  "the research question.";

/** Used when a generation tripped the post-filter — sources existed, but the synthesized answer was
 *  discarded. Lead with the disclaimer and still be USEFUL (offer the sources + good questions),
 *  rather than a flat "I can't answer". */
export const CONSERVATIVE_FALLBACK_COPY =
  "I found related public sources, but I couldn't assemble a fully source-backed direct answer " +
  "without overclaiming. The most relevant public sources are below, along with research angles " +
  "that would make the question easier to evaluate.";

/** Conversational reply for a pure greeting / thanks / "what can you do" message. Fixed copy
 *  (never model output), so — like EMERGENCY_COPY / SOURCING_COPY — it is not run through the
 *  generator or scanned by detectViolations. Kept clean of any forbidden pattern regardless. */
export const GREETING_COPY =
  "Hey — I'm PharmaOrb. I answer questions about medications, supplements, peptides, and " +
  "clinical trials with cited, source-backed evidence. Ask me about a drug, an interaction, a " +
  "mechanism, or what the research says about a treatment, and I'll pull the sources. What would " +
  "you like to look into?";

/** lab_draft hazardous-scope refusal — the request's PURPOSE was producing a dangerous substance,
 *  a weapon, or making a pathogen more dangerous. Refuse the scope, redirect to legitimate design.
 *  Fixed copy (never model output); not run through detectViolations. */
export const LAB_DRAFT_REFUSAL_COPY =
  "I can't help design a study whose aim is making or extracting a controlled or hazardous substance, " +
  "building a weapon, or making a pathogen more dangerous. I can help design legitimate research — for " +
  "example a clinical trial, a pharmacokinetic study, or a detection assay — where the goal is to " +
  "measure, compare, or observe. Please rephrase around what you want to study.";

/** Fixed disclaimer carried on every lab_draft scaffold. Honest, code-authored (rides the one safety
 *  scan as a safety note); the UI also surfaces it as a prominent banner. It is a study-DESIGN draft,
 *  not a validated protocol and not instructions to execute. */
export const LAB_DRAFT_DISCLAIMER =
  "Unvalidated draft for discussion only — not a protocol to execute. Any study must be reviewed and " +
  "approved by your principal investigator and the relevant oversight board (IRB / IACUC / IBC) before " +
  "any work begins. Doses, materials, and procedures here are illustrative, drawn from published " +
  "literature, and must be independently verified.";

export const STANDARD_QUESTIONS = [
  "What population, dose range, or outcome should we narrow the evidence to?",
  "Which source type should carry the most weight: FDA labels, trials, reviews, or safety reports?",
  "Should I compare this with another drug, supplement, compound, or intervention?",
];

/**
 * Provider priority by intent (§7). null = search all providers. The short-
 * circuit intents (emergency_overdose, drug_sourcing) never retrieve.
 */
export function providerPriorityForIntent(intent: Intent): string[] | null {
  switch (intent) {
    case "drug_overview":
    case "side_effects":
    case "label_summary":
    case "drug_interaction":
    case "pregnancy_pediatrics":
    case "mechanism":
    case "dosing":
    case "health_context":
      return ["openfda", "dailymed", "fda_safety", "rxnorm"];
    case "trial_lookup":
      return ["clinicaltrials"];
    case "evidence_for_claim":
    case "supplement_peptide":
      return ["pubmed_oa", "livertox", "lactmed", "clinicaltrials"];
    case "investment":
      return ["clinicaltrials", "pubmed_oa"];
    case "comparison":
    case "emergency_overdose":
    case "drug_sourcing":
    case "smalltalk":
      return null; // broad (comparison) or unused (short-circuit / smalltalk never retrieves)
  }
}
