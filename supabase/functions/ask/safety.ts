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

// GENUINE meaning-flips only. Deliberately EXCLUDES "ask"/"doctor"/"pharmacist"/
// "consult"/"may"/"if"/"before" — those are forced into every answer by the
// generate system prompt, so guarding on them let real violations through
// ("Ask your doctor; this peptide is safe." used to pass).
const TRUE_NEGATION =
  /\b(not|no|never|n'?t|cannot|can'?t|without|avoid|unsafe|isn'?t|aren'?t|wasn'?t|don'?t|doesn'?t|didn'?t|won'?t|unclear|unknown|unproven)\b/i;

// A permission phrase ("you can take") is safe only when framed as a question or
// negation ("whether you can take", "I cannot tell you if you can take").
const REASSURE_GUARD =
  /\b(whether|if|not|never|cannot|can'?t|don'?t|unclear|unknown|tell you)\b/i;

// For "[X] is safe" / "cures Y": excuse the hit on a genuine NEGATION (anywhere in
// the window — it flips the meaning) OR an interrogative that governs the SAME
// clause. "whether/which X is safe" is a QUESTION about safety, not an assertion,
// and it rides on real interaction answers in what_we_know / what_we_do_not_know
// (which ARE scanned — index.ts), so mis-flagging it discards a good cited answer.
// The `[^,]*$` anchor keeps the interrogative in-clause: "whether X is safe" (no
// comma) is excused, but "When used correctly, it is completely safe" (comma ->
// the claim is a separate, asserted clause) is still caught. The comma-free
// conditional ("if taken as directed X is safe") is a knowingly accepted hole,
// backstopped by the generate prompt — far cheaper than discarding real answers.
const CLAIM_GUARD =
  /\b(not|no|never|n'?t|cannot|can'?t|without|avoid|unsafe|isn'?t|aren'?t|wasn'?t|don'?t|doesn'?t|didn'?t|won'?t|unclear|unknown|unproven)\b|\b(whether|which|what|if|when|how)\b[^,]*$/i;

interface Rule {
  name: string;
  re: RegExp;
  /** If this regex matches the window-before+match, the hit is suppressed. */
  guard?: RegExp;
  guardWindow?: number;
}

const RULES: Rule[] = [
  // Affirmative permission to combine/take — "yes you can", "Yes. You can take",
  // "Absolutely, you can take", spanning sentence boundaries and yes-synonyms.
  {
    name: "unsafe_reassurance",
    re: /\byou (can|may) (take|use|combine|mix)\b/i,
    guard: REASSURE_GUARD,
    guardWindow: 40,
  },
  // "It's fine to take them together.", "generally fine to use".
  {
    name: "unsafe_reassurance",
    re: /\b(fine|safe|okay|ok)\s+to\s+(take|use|combine|mix|inject)\b/i,
    guard: TRUE_NEGATION,
    guardWindow: 20,
  },
  // "Stop taking that medication." — including "you may stop taking", "if you ...
  // stop taking" (only a direct negation — "do not stop taking" — is safe).
  {
    name: "medication_change_instruction",
    re: /\b(stop|quit|discontinue|cease|halt)\s+(taking|using|the|your|that)\b/i,
    guard: TRUE_NEGATION,
    guardWindow: 16,
  },
  // "Inject this amount." / "Inject 250 mcg ..." — injection instructions are
  // categorically refused (research-use compounds), so no negation guard.
  { name: "dosing_instruction", re: /\binject(s|ed|ing)?\b[^.?!]{0,30}\b(this|that|the following|\d)/i },
  // Administration verb + quantity (digit OR word) + unit, anywhere in a
  // sentence: "take two tablets", "apply 5 mg gel", "take 50 mg daily". Noun-form
  // label facts ("the label lists a 0.5 mg dose", verb "lists") do not match.
  {
    name: "dosing_instruction",
    re: /\b(take|takes|taking|apply|applies|applying|administer|administers|swallow|swallows|spray|sprays)\s+(about\s+|approximately\s+|around\s+|up to\s+)?(\d+(\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half|a)\s*(mg|mcg|ug|ml|g|grams?|units?|iu|tablets?|pills?|capsules?|caps?|drops?|puffs?|sprays?|doses?)\b/i,
  },
  // "This peptide is safe." — bare safety claim. Excused only by a genuine
  // negation ("is not safe" fails the regex itself; a far-placed "we do not yet
  // know whether it is safe" is caught by the wide window) OR by an interrogative
  // governing the same clause ("whether/which X is safe" — a question, not a
  // claim, and it rides on real interaction answers that MUST NOT be discarded).
  // CLAIM_GUARD's comma anchor still catches "When used correctly, it is safe".
  {
    name: "unsupported_safety_claim",
    re: /\b(is|are|it'?s|seems?|appears?|stays?|remains?)\s+(completely\s+|perfectly\s+|totally\s+|entirely\s+|very\s+|generally\s+|quite\s+|relatively\s+)?safe\b/i,
    guard: CLAIM_GUARD,
    guardWindow: 40,
  },
  // "This will cure your injury." / "TB-500 cures tendons." — any object, not
  // just a pronoun. The (?!for|of) lookahead lets the benign NOUN phrase "a cure
  // for X" pass; CLAIM_GUARD lets "no evidence it cures X" (negation) and
  // "whether it cures X" (question) pass.
  {
    name: "cure_claim",
    re: /\b(will|can|could|going to|to|may)\s+cures?\b|\bcures?\s+(?!for\b|of\b)\w/i,
    guard: CLAIM_GUARD,
    guardWindow: 36,
  },
  // "You do not need to ask a doctor." / "You don't need a doctor."
  {
    name: "no_professional_needed",
    re: /\byou\s+(do not|don'?t|will not|won'?t)\s+need\s+(to\s+(ask|consult|see|talk|speak|visit)|an?\s+(doctor|pharmacist|physician|professional|prescriber|provider))\b/i,
  },
];

/**
 * Returns every doc-20 forbidden pattern found in the answer text. Empty array
 * means the text is clear. The orchestrator treats a non-empty result as a
 * failed generation and substitutes a conservative template — this is what makes
 * the forbidden strings "impossible to produce".
 */
export function detectViolations(answerText: string): Violation[] {
  const out: Violation[] = [];
  for (const rule of RULES) {
    const flags = rule.re.flags.includes("g") ? rule.re.flags : rule.re.flags + "g";
    const re = new RegExp(rule.re.source, flags);
    for (const m of answerText.matchAll(re)) {
      const idx = m.index ?? 0;
      if (rule.guard) {
        const before = answerText.slice(Math.max(0, idx - (rule.guardWindow ?? 24)), idx);
        // Inspect window-before AND the match itself (negation can sit inside).
        if (rule.guard.test(before) || rule.guard.test(m[0])) continue;
      }
      out.push({ rule: rule.name, snippet: m[0].trim().slice(0, 80) });
    }
  }
  return out;
}
