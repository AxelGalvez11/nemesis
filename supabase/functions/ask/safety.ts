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
// A symptom NAME inside a clearly research- or treatment-framed question ("is there a study of X
// for the treatment of chest pain", "a trial to reduce shortness of breath") is the disease being
// STUDIED, not a caller in distress. Such phrasing suppresses ONLY the emergency_possible symptom
// flag (never overdose/self-harm, which describe an action), and only when there is no first-person
// self-report. The LLM classifier independently returns no emergency flag for these, so it remains
// the backstop if this heuristic ever misses.
// LITERATURE anchors only. Deliberately NOT a bare "treatment of" or "to reduce/treat/…" verb:
// those match terse, non-first-person distress ("how to reduce chest pain", "treatment of chest
// pain") and would pull a real symptom query out of the deterministic gate for zero benefit — the
// benchmark questions are already caught by the study/trial anchors. Narrow surface = exactly the
// demonstrated bug, nothing more.
const RESEARCH_FRAMING =
  /\b(is|are)\s+there\s+(a|any)\s+(study|studies|trial|trials|research|evidence|rct|meta-?analysis)\b|\b(study|studies|trial|trials|research|literature|evidence|data)\s+(of|on|for|about|into|investigating|evaluating|assessing|showing)\b|\bfor\s+the\s+treatment\s+of\b|\bclinical\s+trial\b|\bmeta-?analysis\b|\bsystematic\s+review\b/i;
// First-person self-report VETOES the research exception — a person saying "I have chest pain" is
// in distress even if they also ask for a study. Bare word "i"/"my"/"me"; research questions phrased
// in the third person ("is there a study of…") contain none of these.
const FIRST_PERSON_DISTRESS = /\b(i|i'?m|i'?ve|my|me|myself)\b/i;
const OVERDOSE =
  /\b(overdose|overdosed|over-dosed|od'?d|took too many|too many pills|took a (whole|lot of)|swallowed (a|the) (bottle|pack)|how (much|many)[^.?!]*(to (die|overdose)|before i overdose))\b/i;
const SELF_HARM =
  /\b(suicid|kill myself|killing myself|end my life|ending my life|hurt myself|harm myself|want to die|don'?t want to (live|be here)|take my (own )?life)\b/i;
const SOURCING =
  /\b(where (can|do|could) i (buy|get|order|source|find)|how (can|do) i (buy|get|order|source)|buy[^.?!]*(online|without (a )?prescription|no prescription|otc)|black market|gr[ae]y market|research chems?|without a prescription)\b/i;

/** Scan the question. Emergency family wins over sourcing. */
export function preScreen(question: string): PreScreenResult {
  const flags: SafetyFlag[] = [];
  // emergency_possible (symptom topic) is suppressed for a third-person research/treatment
  // question; overdose_possible / self_harm (an action) are NEVER suppressed.
  const researchTopic = RESEARCH_FRAMING.test(question) && !FIRST_PERSON_DISTRESS.test(question);
  if (EMERGENCY_SYMPTOM.test(question) && !researchTopic) flags.push("emergency_possible");
  if (OVERDOSE.test(question)) flags.push("overdose_possible");
  if (SELF_HARM.test(question)) flags.push("self_harm");

  if (flags.length > 0) return { flags, shortCircuit: "emergency_routing" };

  if (SOURCING.test(question)) {
    return { flags: ["drug_sourcing"], shortCircuit: "sourcing_refusal" };
  }
  return { flags: [], shortCircuit: null };
}

// ---------------------------------------------------------------------------
// Educational-toxicity carve-out (deterministic, post-classify)
// ---------------------------------------------------------------------------
//
// preScreen has NO "lethal"/"toxic" pattern, so "is celsius lethal" passes it clean — the
// emergency_possible on such a question is added by the LLM classifier, whose system prompt is
// told to "err toward flagging…any hint of…too-much-taken". A THIRD-PERSON "is X lethal/toxic/
// dangerous" question is an educational toxicity query, not a caller in distress, and answering
// it (with the standard safety framing + clinician routing) is correct. This relaxes ONLY that
// specific over-route. It mirrors preScreen's existing RESEARCH_FRAMING/FIRST_PERSON_DISTRESS
// symptom carve-out — but it must live HERE (after classify) because the preScreen carve-out can
// only suppress preScreen's OWN flag, never one the classifier adds downstream.

// Danger/toxicity predicates a general "is X …?" inquiry uses. "safe"/"unsafe" are deliberately
// excluded — they rarely trigger emergency and broadening here buys nothing (the relax is keyed
// to the danger words that actually cause the over-route).
const TOXICITY_DANGER =
  /\b(lethal|toxic|toxicity|deadly|fatal|poison|poisonous|harmful|dangerous|carcinogenic|hepatotoxic|nephrotoxic|cardiotoxic)\b/i;
// Asking for a lethal AMOUNT — "lethal dose of X", "how much/many X is fatal" — is harm-adjacent
// (overdose/self-harm territory), so it is NEVER treated as a benign educational inquiry even
// though it shares the danger vocabulary.
const LETHAL_AMOUNT =
  /\b(lethal|toxic|fatal|deadly)\s+(dose|dosage|amount|level|quantity|concentration)\b|\bhow\s+(much|many)\b/i;

/**
 * True when the question is a general, third-person toxicity/danger inquiry ("is X lethal/toxic/
 * dangerous?") — educational, not an active emergency. False the moment it looks like distress: a
 * first-person report, an acute emergency symptom, an overdose/self-harm phrasing, or a request for
 * a lethal AMOUNT. PURE.
 */
export function isGeneralToxicityQuestion(question: string): boolean {
  return TOXICITY_DANGER.test(question) &&
    !FIRST_PERSON_DISTRESS.test(question) &&
    !EMERGENCY_SYMPTOM.test(question) &&
    !OVERDOSE.test(question) &&
    !SELF_HARM.test(question) &&
    !LETHAL_AMOUNT.test(question);
}

/**
 * Relax the classifier's over-eager emergency-family flags on a general toxicity inquiry. STRICT
 * and fail-safe: returns the flags UNCHANGED unless the question is deterministically certified
 * educational (third-person, no acute symptom, no overdose phrasing, no lethal-amount ask — see
 * isGeneralToxicityQuestion). On such a question BOTH emergency_possible AND overdose_possible are
 * relaxed: the deterministic scan has already PROVEN the text carries no overdose phrasing, so a
 * classifier's overdose_possible here is the same over-flagging as its emergency_possible, not
 * evidence of something worse. (2026-07: the v4-flash classifier co-flags both on "is celsius
 * lethal"; the old solo-flag rule let the co-flag through and emergency-templated an educational
 * question — caught by the guardrail suite within the hour of the model swap.) self_harm is an
 * ABSOLUTE veto: if the classifier senses self-harm, nothing is relaxed, ever. PURE.
 */
export function suppressEmergencyForGeneralToxicity(
  question: string,
  flags: readonly SafetyFlag[],
): SafetyFlag[] {
  if (flags.includes("self_harm")) return [...flags];
  if (!isGeneralToxicityQuestion(question)) return [...flags];
  return flags.filter((f) => f !== "emergency_possible" && f !== "overdose_possible");
}

// ---------------------------------------------------------------------------
// Small-talk detector (deterministic, no LLM)
// ---------------------------------------------------------------------------

// Matches ONLY when the WHOLE message is a greeting / thanks / farewell / "what are you / what
// can you do" capability ping — anchored ^…$ so anything with a real question mixed in ("hi, is
// lisinopril safe?") falls through to the full pipeline untouched. Intentionally narrow: no drug,
// dose, or clinical token can appear. It is checked AFTER preScreen (index.ts), so an
// emergency/overdose/self-harm/sourcing message is hard-routed first and never reaches here.
// One greeting/thanks/farewell/capability phrase. Reused below so the matcher can accept a SEQUENCE
// of them (a combined greeting is still pure small-talk).
const GREETING_PHRASE =
  "(?:hi+|hey+|hello+|hiya|heya|yo|howdy|greetings)(?:\\s+there)?|sup|wassup|what'?s up|good\\s*(?:morning|afternoon|evening|day)|how\\s*(?:are|r)\\s*(?:you|u|ya)(?:\\s*doing|\\s*going)?|how'?s\\s*it\\s*going|how\\s*are\\s*things|thanks?(?:\\s*(?:you|u|so much|a lot|a ton))?|thank\\s*(?:you|u)|thx|ty|tysm|cheers|much appreciated|appreciate it|ok(?:ay)?(?:\\s*(?:thanks?|cool|got it))?|cool|nice|awesome|great|perfect|got it|gotcha|makes sense|sounds good|bye+|goodbye|see\\s*(?:ya|you)(?:\\s*later)?|good\\s*night|gn|take care|who\\s*(?:are|r)\\s*(?:you|u)|what\\s*(?:are|r)\\s*(?:you|u)|what\\s*(?:can|do)\\s*(?:you|u)\\s*do|what\\s*is\\s*this";
// Match ONE greeting phrase, then ANY NUMBER more separated by space/comma — so "hi how are you" and
// "hey there, thanks" are pure small-talk. A real question stacked after a greeting ("hi what is
// metformin") still FALLS THROUGH: its non-greeting part matches no phrase, so the anchored ^…$ fails.
const SMALL_TALK = new RegExp(
  `^\\s*(?:${GREETING_PHRASE})(?:[\\s,]+(?:${GREETING_PHRASE}))*\\s*[!.?,…]*\\s*$`,
  "i",
);
// NOTE: a bare "help" is intentionally NOT small-talk. In a medical app it can be a distress
// signal, so it falls through to the full pipeline where the classifier can flag self_harm from
// context — never answered with a canned greeting.

/** True when the entire message is social/greeting/capability small-talk (no clinical content). */
export function detectSmallTalk(question: string): boolean {
  return SMALL_TALK.test(question.trim());
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
  // Dose-ESCALATION imperative: a BASE-FORM titration verb + preposition + quantity +
  // unit ("start at 0.25 mg", "increase to 0.5 mg", "go up by 2.5 mg", "work up to 500
  // mcg"). Base form ONLY is the precision lever — the imperative the plain register
  // reaches for uses the bare verb, while the FAITHFUL label report uses the -ing/-s/-ed
  // forms ("a STARTING dosage of 0.25 mg, INCREASING to 0.5 mg", "weekly 500 mg
  // INCREASES up to 2000 mg"), none of which \bstart\b / \bincrease\b can match, so the
  // noun-form label canaries stay clean. The negative look-behind drops "a step up to 5
  // mg" — an article before the verb makes it a noun phrase, not an instruction.
  {
    name: "dosing_instruction",
    re: /(?<!\b(?:a|an|the|each|every|another|further|gradual|stepwise|initial|recommended|maintenance|target|maximum|of)\s)\b(start|begin|initiate|titrate|increase|escalate|step\s+up|work\s+up|go\s+up|ramp\s+up|bump\s+up|move\s+up)\s+(at|to|by|up\s+to)\s+(about\s+|approximately\s+|around\s+)?(\d+(\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half)\s*(mg|mcg|ug|µg|ml|cc|g|grams?|units?|iu|tablets?|pills?|capsules?|caps?|drops?|puffs?|sprays?|doses?)\b/i,
  },
  // Injection slang/peptide-community verbs (or literal "inject"/"self-inject") +
  // quantity + an injectable unit: "pin 250 mcg", "jab 0.5 ml", "inject two units".
  // Unit-anchored so a common word like "pin"/"shoot" only trips on a real dose. No
  // negation guard — an injection instruction is categorically refused (research-use
  // compounds). Quantity-FREE technique ("reconstitute then inject subq") is prompt-only
  // by design (the audit's call), since a unit-free "inject" rule would catch everything.
  {
    name: "dosing_instruction",
    re: /\b(pin|pins|pinning|jab|jabs|jabbing|shoot|shoots|shooting|slam|slams|subq|sub-?q|microdose|microdoses|microdosing|inject|injects|injecting|self-?inject(s|ed|ing)?)\s+(about\s+|approximately\s+|around\s+|up\s+to\s+)?(\d+(\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half)\s*(mg|mcg|ug|µg|iu|units?|ml|cc)\b/i,
  },
  // "This peptide is safe." — bare safety claim. Excused only by a genuine
  // negation ("is not safe" fails the regex itself; a far-placed "we do not yet
  // know whether it is safe" is caught by the wide window) OR by an interrogative
  // governing the same clause ("whether/which X is safe" — a question, not a
  // claim, and it rides on real interaction answers that MUST NOT be discarded).
  // CLAIM_GUARD's comma anchor still catches "When used correctly, it is safe".
  {
    name: "unsupported_safety_claim",
    re: /\b(is|are|was|were|it'?s|seems?|appears?|stays?|remains?|has been|have been|had been)\s+(completely\s+|perfectly\s+|totally\s+|entirely\s+|very\s+|generally\s+|quite\s+|relatively\s+|a\s+|an\s+)?safe(r|st)?\b(?!-)/i,
    guard: CLAIM_GUARD,
    guardWindow: 40,
  },
  // Connector / participle forms the copula rule can't see: "considered safe",
  // "regarded as safe", "deemed safe", "found to be safe", "proven safe". Same
  // CLAIM_GUARD, so "not considered safe" / "whether it is regarded as safe" pass.
  // ("described/regarded AS POSSIBLY safe" — an attributed, hedged source paraphrase —
  // is intentionally NOT matched: only these specific verdict connectors are.)
  {
    name: "unsupported_safety_claim",
    re: /\b(considered|regarded\s+as|deemed|found\s+to\s+be|proven|proved|viewed\s+as|established\s+as)\s+(completely\s+|perfectly\s+|totally\s+|entirely\s+|very\s+|generally\s+|quite\s+|relatively\s+)?safe(r|st)?\b(?!-)/i,
    guard: CLAIM_GUARD,
    guardWindow: 40,
  },
  // Bare superlative "the safest" / "one of the safest" — a stronger endorsement than
  // "is safe", with no copula for the rule above to anchor on. (Bare comparative "safer"
  // is deliberately NOT here — too often a faithful "a safer alternative per the review";
  // only the copula form "is safer" above is caught.)
  {
    name: "unsupported_safety_claim",
    re: /\bsafest\b/i,
    guard: CLAIM_GUARD,
    guardWindow: 40,
  },
  // Safety verdict in noun-phrase form: "excellent / good / strong … safety profile
  // (or record / margin)". CLAIM_GUARD lets "no good safety profile" / "unknown safety
  // record" pass.
  {
    name: "unsupported_safety_claim",
    re: /\b(excellent|great|good|strong|solid|reassuring|favou?rable|clean|impeccable|pristine|outstanding|proven)\s+safety\s+(profile|record|margin|track\s+record)\b/i,
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
 * Strip markdown SYNTAX (not content) so the deterministic scan sees the real phrase even when the
 * answer is formatted — "do not **stop** taking" must scan as "do not stop taking", "is s**a**fe" as
 * "is safe", "**inject** 250mcg" as "inject 250mcg". This makes the scan ROBUST to markdown-based
 * evasion: it only ever REVEALS a banned phrase, never hides one (a banned span split by emphasis
 * markers gets re-joined). Applied ONLY in the scan path below — the stored/rendered answer keeps its
 * markdown. Line-start list/quote/header markers are removed; hyphens mid-word ("non-scarring") are NOT
 * a marker and are left untouched.
 */
export function stripMarkdownForScan(text: string): string {
  return text
    .replace(/`([^`]*)`/g, "$1")             // `inline code`
    .replace(/\*\*([^*]+)\*\*/g, "$1")       // **bold**
    .replace(/__([^_]+)__/g, "$1")           // __bold__
    .replace(/\*([^*]+)\*/g, "$1")           // *italic*
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,!?:;]|$)/g, "$1$2") // _italic_ (word-bounded, not mid-token underscores)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) -> text
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")    // ## headers
    .replace(/^[ \t]*>[ \t]?/gm, "")          // > blockquotes
    .replace(/^[ \t]*[-*+][ \t]+/gm, "")      // - / * / + bullet markers (line start only)
    .replace(/^[ \t]*\d+\.[ \t]+/gm, "");     // 1. numbered markers (line start only)
}

/**
 * Returns every doc-20 forbidden pattern found in the answer text. Empty array
 * means the text is clear. The orchestrator treats a non-empty result as a
 * failed generation and substitutes a conservative template — this is what makes
 * the forbidden strings "impossible to produce". The text is markdown-stripped
 * first (stripMarkdownForScan) so formatting can never split a banned phrase past a rule.
 */
export function detectViolations(answerText: string): Violation[] {
  answerText = stripMarkdownForScan(answerText);
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
