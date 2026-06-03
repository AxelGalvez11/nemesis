// Deterministic safety layer — NO LLM, so it cannot be talked around.
//
// preScreen()        runs on the QUESTION, before any model call. Emergency /
//                    overdose / self-harm hard-route to Poison Control; sourcing
//                    refuses. The cheap, un-bypassable first gate.
// detectViolations() runs on the GENERATED answer, after the model. It scans for
//                    the doc-20 "must NEVER produce" list; the orchestrator
//                    discards any answer with a hit and returns a conservative
//                    template instead. This is what makes the forbidden strings
//                    "impossible to produce" (doc-20) — not the CI suite, which
//                    only samples model behavior.

import type { SafetyFlag } from "../../../packages/shared/src/answer.ts";

export interface PreScreenResult {
  flags: SafetyFlag[];
  shortCircuit: "emergency_routing" | "sourcing_refusal" | null;
}

const EMERGENCY_SYMPTOM =
  /\b(chest pain|can'?t breathe|cannot breathe|trouble breathing|short(ness)? of breath|unconscious|unresponsive|passing out|passed out|seizure|convuls|anaphyla|severe bleeding|blue lips|blacking out)\b/i;
const OVERDOSE =
  /\b(overdose|overdosed|over-dosed|od'?d|took too many|too many pills|took a (whole|lot of)|swallowed (a|the) (bottle|pack)|how (much|many)[^.?!]*(to (die|overdose)|before i overdose))\b/i;
const SELF_HARM =
  /\b(suicid|kill myself|killing myself|end my life|ending my life|hurt myself|harm myself|want to die|don'?t want to (live|be here)|take my (own )?life)\b/i;
const SOURCING =
  /\b(where (can|do|could) i (buy|get|order|source|find)|how (can|do) i (buy|get|order|source)|buy[^.?!]*(online|without (a )?prescription|no prescription|otc)|black market|gr[ae]y market|research chems?|without a prescription)\b/i;

/** Scan the question. Emergency family wins over sourcing. */
export function preScreen(question: string): PreScreenResult {
  const flags: SafetyFlag[] = [];
  if (EMERGENCY_SYMPTOM.test(question)) flags.push("emergency_possible");
  if (OVERDOSE.test(question)) flags.push("overdose_possible");
  if (SELF_HARM.test(question)) flags.push("self_harm");

  if (flags.length > 0) return { flags, shortCircuit: "emergency_routing" };

  if (SOURCING.test(question)) {
    return { flags: ["drug_sourcing"], shortCircuit: "sourcing_refusal" };
  }
  return { flags: [], shortCircuit: null };
}

// ---------------------------------------------------------------------------
// Post-generation forbidden-pattern detector
// ---------------------------------------------------------------------------

export interface Violation {
  rule: string;
  snippet: string;
}

/** Words near a match that flip it from a violation to safe guidance. */
const NEGATION_CONTEXT =
  /\b(not|no|never|n'?t|cannot|can'?t|without|avoid|unless|before|ask|asking|consult|talk|speak|discuss|prescriber|doctor|physician|pharmacist|professional|may|might|whether|if)\b/i;

interface Rule {
  name: string;
  re: RegExp;
  /** When set, the match is a violation only if no negation/caution precedes it. */
  guardWindow?: number;
}

const RULES: Rule[] = [
  // "Yes, you can take them together." — unsafe affirmative for combining drugs.
  { name: "unsafe_reassurance", re: /\byes\b[^.?!]{0,40}\byou can (take|use|combine|mix)\b/i },
  // "Stop taking that medication." — imperative therapy change.
  {
    name: "medication_change_instruction",
    re: /\b(stop|quit|discontinue|cease|halt)\s+(taking|using|the|your|that)\b/i,
    guardWindow: 32,
  },
  // "Inject this amount." / "Inject 250 mcg ..." — dosing instruction.
  { name: "dosing_instruction", re: /\binject(s|ing)?\b[^.?!]{0,30}\b(this|that|the following|\d)/i },
  // Imperative dose at a sentence start: "Take 0.5 mg ..." (label facts like
  // "the label lists a 0.5 mg dose" start with a noun, not the verb, so pass).
  {
    name: "dosing_instruction",
    re: /(^|[.!?]\s+|\n)\s*(take|administer|apply)\s+(about\s+|approximately\s+|around\s+)?\d+(\.\d+)?\s*(mg|mcg|ug|ml|g|units?|iu|tablets?|pills?|capsules?|drops?|puffs?|mL)\b/i,
  },
  // "This peptide is safe." — bare safety claim (negation guard handles "is not safe").
  {
    name: "unsupported_safety_claim",
    re: /\b(is|are|it'?s|seems?|appears?|stays?|remains?)\s+(completely\s+|perfectly\s+|totally\s+|entirely\s+|very\s+|generally\s+)?safe\b/i,
    guardWindow: 24,
  },
  // "This will cure your injury." — cure claim.
  {
    name: "cure_claim",
    re: /\b(will|can|could|going to|to)\s+cure\b|\bcures?\s+(your|the|this|it|them)\b/i,
    guardWindow: 24,
  },
  // "You do not need to ask a doctor."
  {
    name: "no_professional_needed",
    re: /\byou\s+(do not|don'?t|will not|won'?t)\s+need\s+to\s+(ask|consult|see|talk to|speak (to|with)|visit)\b/i,
  },
];

/**
 * Returns every doc-20 forbidden pattern found in the answer text. Empty array
 * means the text is clear. The orchestrator treats a non-empty result as a
 * failed generation and substitutes a conservative template.
 */
export function detectViolations(answerText: string): Violation[] {
  const out: Violation[] = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.re.source, rule.re.flags.includes("g") ? rule.re.flags : rule.re.flags + "g");
    for (const m of answerText.matchAll(re)) {
      const idx = m.index ?? 0;
      if (rule.guardWindow) {
        const before = answerText.slice(Math.max(0, idx - rule.guardWindow), idx);
        // For the safety claim, the negation often sits between the verb and
        // "safe" (e.g. "is not safe"), so also inspect the match itself.
        if (NEGATION_CONTEXT.test(before) || NEGATION_CONTEXT.test(m[0])) continue;
      }
      out.push({ rule: rule.name, snippet: m[0].trim().slice(0, 80) });
    }
  }
  return out;
}
