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

/** doc-20 no-source refusal — disclaimer-forward + professional pointer (doc-20: always point to a
 *  doctor/pharmacist). Helpful tone: it's general information, not a refusal to engage. */
export const NO_SOURCE_COPY =
  "I couldn't find a reliable public source for that specific point, so I won't present it as " +
  "established evidence. This is general information, not medical advice — please ask your doctor " +
  "or pharmacist about your specific situation.";

/** Used when a generation tripped the post-filter — sources existed, but the synthesized answer was
 *  discarded. Lead with the disclaimer and still be USEFUL (offer the sources + good questions),
 *  rather than a flat "I can't answer". */
export const CONSERVATIVE_FALLBACK_COPY =
  "This is general information from public sources — not medical advice, and no substitute for a " +
  "clinician who knows your history. I couldn't put together a fully source-backed direct answer " +
  "here, but the most relevant public sources are below, with good questions to bring to a " +
  "healthcare professional.";

/** Conversational reply for a pure greeting / thanks / "what can you do" message. Fixed copy
 *  (never model output), so — like EMERGENCY_COPY / SOURCING_COPY — it is not run through the
 *  generator or scanned by detectViolations. Kept clean of any forbidden pattern regardless. */
export const GREETING_COPY =
  "Hey — I'm PharmaOrb. I answer questions about medications, supplements, peptides, and " +
  "clinical trials with cited, source-backed evidence. Ask me about a drug, an interaction, a " +
  "mechanism, or what the research says about a treatment, and I'll pull the sources. What would " +
  "you like to look into?";

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
    case "smalltalk":
      return null; // broad (comparison) or unused (short-circuit / smalltalk never retrieves)
  }
}
