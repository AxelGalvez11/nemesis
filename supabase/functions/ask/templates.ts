// Canned copy (verbatim doc-18 / doc-20) + intent->provider retrieval priority.
// These are the deterministic answer paths: emergency routing, sourcing refusal,
// and no-source refusal never touch the generator.

import type { Intent } from "../../../packages/shared/src/answer.ts";

/** doc-18 medical disclaimer — rides on every answer. */
export const MEDICAL_DISCLAIMER =
  "PharmaBro provides educational information from public sources such as FDA labels, " +
  "DailyMed, PubMed, and ClinicalTrials.gov. It does not provide medical advice, diagnosis, " +
  "treatment, or prescribing decisions. Always consult a qualified healthcare professional " +
  "for personal medical decisions.";

/** doc-18 / doc-20 emergency routing — verbatim. */
export const EMERGENCY_COPY =
  "This could be urgent. If you may be experiencing a medical emergency, call emergency " +
  "services now. For possible poisoning or overdose in the U.S., contact Poison Control at " +
  "1-800-222-1222.\n\nI can provide general educational information after immediate safety is addressed.";

/** doc-20 drug-sourcing refusal — refuse to source, offer education only. */
export const SOURCING_COPY =
  "I can't help with finding, buying, or sourcing medications or research compounds. " +
  "I can share educational information about what a compound is, what the evidence says, " +
  "and questions to ask a licensed healthcare professional.";

/** doc-20 no-source refusal — verbatim core sentence + professional pointer
 *  (doc-20: always point to a doctor/pharmacist, even when refusing). */
export const NO_SOURCE_COPY =
  "I could not find a reliable source for that specific claim in the available public " +
  "sources. I should not present it as established evidence. Please ask your doctor or " +
  "pharmacist about your specific situation.";

/** Used when a generation tripped the post-filter — sources existed, but the
 *  synthesized answer was unsafe, so it is discarded rather than shown. */
export const CONSERVATIVE_FALLBACK_COPY =
  "I can't give a direct answer to that safely. Below are the public sources most relevant " +
  "to your question, along with questions to ask a licensed healthcare professional.";

export const STANDARD_QUESTIONS = [
  "Is this appropriate for me given my health history?",
  "Are there interactions with my current medications?",
  "What monitoring or follow-up would I need?",
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
      return null; // broad (comparison) or unused (short-circuit)
  }
}
