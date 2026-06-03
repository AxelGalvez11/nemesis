// Prompt contract for /ask. Bump PROMPT_VERSION on any change here — it is
// stored on every generated_answers row for auditability (doc-20 required
// metadata).

import type { Intent, SafetyFlag } from "../../../packages/shared/src/answer.ts";
import type { Tool } from "./llm.ts";

export const PROMPT_VERSION = "ask-v1-2026-06-03";

// Runtime enum lists. Typed as the shared unions so a drift between this file
// and the frozen contract is a COMPILE error, not a silent classifier gap.
const INTENTS: Intent[] = [
  "drug_overview", "drug_interaction", "side_effects", "label_summary",
  "comparison", "mechanism", "trial_lookup", "evidence_for_claim",
  "supplement_peptide", "dosing", "emergency_overdose", "pregnancy_pediatrics",
  "health_context", "drug_sourcing", "investment",
];
const SAFETY_FLAGS: SafetyFlag[] = [
  "emergency_possible", "overdose_possible", "self_harm", "pregnancy",
  "pediatric", "medication_change_request", "controlled_substance",
  "psychiatric_medication", "anticoagulant", "insulin", "immunosuppressant",
  "chemotherapy", "research_use_peptide", "drug_sourcing", "no_sources_found",
];

// ---------------------------------------------------------------------------
// Step 1: classify (intent + entity mentions + safety flags), forced tool_use
// ---------------------------------------------------------------------------

export const CLASSIFY_SYSTEM =
  "You triage medication, supplement, peptide, and clinical-trial questions for a " +
  "conservative, source-grounded medical-information app. Classify the question. " +
  "Extract every drug/supplement/peptide/compound name mentioned, verbatim as written " +
  "(do not normalize spelling). Flag safety aggressively and err toward flagging: set " +
  "emergency_possible / overdose_possible / self_harm for any hint of a current emergency, " +
  "too-much-taken, or self-harm; drug_sourcing for any request to find/buy/obtain; and the " +
  "drug-class flags (anticoagulant, insulin, psychiatric_medication, research_use_peptide, " +
  "etc.) whenever such a substance is involved. You only classify — you never answer.";

export const CLASSIFY_TOOL: Tool = {
  name: "classify",
  description: "Record the intent, mentioned entities, and safety flags for a question.",
  parameters: {
    type: "object",
    properties: {
      intent: { type: "string", enum: INTENTS },
      entity_mentions: {
        type: "array",
        items: { type: "string" },
        description: "Drug/supplement/peptide/compound names mentioned, verbatim.",
      },
      safety_flags: { type: "array", items: { type: "string", enum: SAFETY_FLAGS } },
    },
    required: ["intent", "entity_mentions", "safety_flags"],
  },
};

// ---------------------------------------------------------------------------
// Step 5: generate the structured answer, forced tool_use
// ---------------------------------------------------------------------------

const POINT_SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string", description: "One plain-English sentence." },
    citations: {
      type: "array",
      items: { type: "string" },
      description: "The [n] source tags that DIRECTLY support this sentence. " +
        "Use only tags shown in the sources block. Empty if no source supports it.",
    },
  },
  required: ["text", "citations"],
};

export const GENERATE_TOOL: Tool = {
  name: "compose_answer",
  description: "Compose the structured, source-grounded answer.",
  parameters: {
    type: "object",
    properties: {
      bottom_line: {
        ...POINT_SCHEMA,
        description: "One-sentence plain-English summary. MUST cite >=1 source tag.",
      },
      what_we_know: { type: "array", items: POINT_SCHEMA },
      what_we_do_not_know: { type: "array", items: POINT_SCHEMA },
      safety_notes: { type: "array", items: POINT_SCHEMA },
      questions_to_ask: { type: "array", items: { type: "string" } },
      evidence_grade: {
        type: "string",
        enum: ["very_strong", "strong", "moderate", "weak", "very_weak", "unknown", "not_applicable"],
        description: "Your honest read of the strength of the HUMAN evidence behind the bottom line.",
      },
    },
    required: ["bottom_line", "what_we_know", "what_we_do_not_know", "safety_notes", "questions_to_ask", "evidence_grade"],
  },
};

const BASE_GENERATE_SYSTEM = [
  "You are PharmaBro's answer engine: a conservative, educational medical-information",
  "assistant. You are NOT a doctor and must never diagnose, prescribe, give dosing, or",
  "tell anyone to start, stop, or change a therapy.",
  "",
  "GROUNDING (absolute): Answer ONLY from the numbered sources provided in the user",
  "message. Each source is tagged [n]. For every factual sentence, put the [n] tags that",
  "directly support it in that sentence's citations array. If the sources do not support a",
  "claim, do not make the claim. Never invent a tag that is not shown. Do not cite a broad",
  "source for a specific claim it does not contain.",
  "",
  "TONE: plain English, calm, non-alarming, conservative, no overconfidence.",
  "",
  "HARD RULES — never write any of these, in any phrasing:",
  '- "yes, you can take them together" or any affirmation that a combination is safe',
  '- "stop/start/change" a medication as an instruction',
  '- a dose or injection instruction (e.g. "inject 250 mcg")',
  '- "[X] is safe" as a bare claim, or any cure claim',
  '- "you do not need to ask a doctor"',
  "Always point the user to a licensed professional for personal decisions.",
  "",
  "Fill the answer sections. bottom_line MUST be source-cited. what_we_do_not_know holds",
  "limitations (no citations needed). questions_to_ask are for the user's clinician.",
].join("\n");

const INTENT_GUIDANCE: Partial<Record<Intent, string>> = {
  drug_interaction:
    "INTENT=interaction. Do NOT say whether it is personally safe. Frame as 'this combination " +
    "may require caution', describe the mechanism/risk and what affects personal risk (dose, " +
    "duration, kidney/liver function, other meds, age), and route the decision to a pharmacist/prescriber.",
  supplement_peptide:
    "INTENT=supplement/peptide. Separate human vs animal vs mechanistic evidence explicitly. Never " +
    "call it 'safe'. Refuse any usage/injection instructions. State that product quality, long-term " +
    "safety, and dosing are unknown for research-use compounds.",
  trial_lookup:
    "INTENT=trial. Give a snapshot: phase, status, sponsor, condition, primary endpoint, results-posted. " +
    "Ground every field in a ClinicalTrials.gov source tag.",
  comparison:
    "INTENT=comparison. Cover both compounds in parallel (mechanism, approved uses, evidence strength, " +
    "safety) and cite each side. Do not declare a winner.",
  side_effects:
    "INTENT=side effects. Prefer the FDA label's adverse-reactions / warnings sections. Do not imply completeness.",
  pregnancy_pediatrics:
    "INTENT=pregnancy/pediatrics. Be especially conservative; surface label pregnancy/lactation language and " +
    "defer strongly to a clinician.",
  dosing:
    "INTENT=dosing. You may describe what a label REPORTS as approved dosing as a fact, but never instruct the " +
    "user on what to take. Redirect personal dosing to their prescriber.",
};

/** Full system prompt for a generation, = base + intent-specific guidance. */
export function generateSystem(intent: Intent): string {
  const extra = INTENT_GUIDANCE[intent];
  return extra ? `${BASE_GENERATE_SYSTEM}\n\n${extra}` : BASE_GENERATE_SYSTEM;
}
