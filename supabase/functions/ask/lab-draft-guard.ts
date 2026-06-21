// Wet-lab DRAFT mode — hazardous-SCOPE guard (pure, deterministic; NOT part of the frozen /ask safety
// layer). The lab_draft ReportMode produces a literature-grounded study-DESIGN scaffold (objective,
// arms, controls, endpoints, assays, sample-size, pitfalls) — never an executable protocol or a
// synthesis route. This guard runs on the QUESTION, BEFORE any retrieval, and is the PRIMARY control:
// it declines a request whose SCOPE is chemical-synthesis/production, weaponization, or pathogen
// gain-of-function, and otherwise lets a legitimate study-design request through (the design-only
// synthesis prompt is the backstop — a real trial design is arms/endpoints/sample-size, which contains
// no synthesis route).
//
// It is a CONSERVATIVE FLOOR for a beta, not an evasion-proof classifier: the threat model is
// accidental surfacing + brand drift, not a determined adversary (see the ledger). So it leans
// refuse-when-the-SCOPE-is-clearly-hazardous while protecting the single highest-value false positive
// in a research app — EVIDENCE synthesis ("synthesize the evidence") is NOT chemical synthesis.
//
// Lives outside safety.ts on purpose: safety.ts (preScreen/detectViolations) is frozen and shared by
// ALL /ask traffic; this guard gates ONLY the lab_draft mode and must not alter the general pipeline.

export type LabDraftHazard = "synthesis" | "weaponization" | "biothreat";

export interface LabDraftScopeResult {
  /** true = the request is in-scope (study-design); false = hazardous scope, refuse before retrieval. */
  allowed: boolean;
  /** the hazard family that triggered a refusal; present iff !allowed. */
  hazard?: LabDraftHazard;
}

// Substances whose PRODUCTION (not study) is the hazard. Used only inside production-verb contexts —
// the bare name is harmless (a fentanyl ASSAY or an oxycodone-taper STUDY is legitimate design).
const ILLICIT_DRUG =
  String.raw`fentanyl|carfentanil|methamphetamine|meth|amphetamine|cocaine|crack|heroin|mdma|ecstasy|lsd|dmt|cathinone|mephedrone|a (controlled substance|narcotic|illegal drug|psychoactive (?:drug|substance))`;

// What it is hazardous to SYNTHESIZE. Generic "drug"/"substance" are intentionally NOT here: they
// collide with legitimate evidence synthesis ("synthesize drug-safety data", "synthesize
// substance-use findings"). Specific chemical objects + illicit drug NAMES are unambiguous.
const SYNTH_HAZARD_OBJECT =
  String.raw`compounds?|molecules?|reagents?|precursors?|controlled\s+substances?|narcotics?|nerve\s+agents?|sarin|vx|ricin|explosives?|fentanyl|carfentanil|methamphetamine|meth|amphetamine|cocaine|crack|heroin|mdma|ecstasy|lsd|dmt|cathinone|mephedrone`;

// The LEGITIMATE synthesis object in a research app: the EVIDENCE/literature/data, not a chemical.
// Bound to the object position (right after the verb, modulo determiners) so it allows
// "synthesize the evidence on X" WITHOUT being a forward scan that trailing research words can trip.
const EVIDENCE_OBJECT =
  String.raw`(?:(?:the|a|an|some|all|prior|existing|published|available|current|recent|relevant)\s+)*(?:evidence|literature|data|datasets?|findings?|results?|outcomes?|studies|study|trials?|research|information|reviews?|papers?|reports?)`;

// CHEMICAL-SYNTHESIS / PRODUCTION scope. Match requires explicit synthesis-route wording, OR
// "synthesize <hazardous object>" where the OBJECT (not a trailing word) decides — this is the load-
// bearing rebind: the guard runs only in lab_draft mode where every query trails "study/trial/results/
// data", so a forward "exclude if a research word appears anywhere" rule disabled itself in its own
// register (see lab-draft-guard.test.ts regression). OR a production verb (make/cook/produce/
// manufacture/brew) aimed at a drug/chemical, OR extraction of a controlled drug FROM a product/plant.
const SYNTHESIS = new RegExp(
  [
    String.raw`\b(?:chemical|total|clandestine|illicit|home|drug)\s+synthesis\b`,
    String.raw`\bsynthesis\s+(?:route|procedure|protocol|scheme|pathway|steps|method)\b`,
    // "synthesize/synthesizing/synthesizes <hazardous object>" decided by the OBJECT: refuse unless the
    // object is evidence/literature/data (allow), regardless of any research words that TRAIL the object.
    // Gerund/3rd-person are covered because "design a study synthesizing X" is the mode's normal register.
    // Up to three determiner/adjective filler words may precede the object ("synthesize a pure compound",
    // "synthesize a batch of methamphetamine").
    String.raw`\bsynthesi[sz](?:e|es|ing)\b\s+(?!${EVIDENCE_OBJECT}\b)(?:[\w-]+[\s-]+){0,3}?(?:${SYNTH_HAZARD_OBJECT})\b`,
    String.raw`\b(?:how\s+(?:to|do\s+i|can\s+i)\s+)?(?:make|cook|produce|manufacture|brew)\b[^.?!]*\b(?:${ILLICIT_DRUG}|nerve agent|sarin|vx|ricin|an?\s+(?:explosive|bomb))\b`,
    String.raw`\b(?:extract|isolate|purify|recover)\b[^.?!]*\bfrom\b[^.?!]*\b(?:patch(?:es)?|pills?|tablets?|capsules?|poppy|opium|coca|cough syrup|blotter)\b`,
  ].join("|"),
  "i",
);

// WEAPONIZATION scope — chemical/biological/radiological weapons, named agents, dispersal.
const WEAPONIZATION = new RegExp(
  [
    String.raw`\bweaponi[sz]`,
    String.raw`\b(?:chemical|biological|bio|nuclear|radiological|dirty)\s+(?:weapon|bomb)\b`,
    String.raw`\bbioweapon`,
    String.raw`\bnerve\s+(?:agent|gas)\b`,
    String.raw`\b(?:sarin|tabun|soman|vx|novichok|mustard gas|phosgene|chlorine gas|hydrogen cyanide gas)\b`,
    String.raw`\baerosoli[sz]`,
    String.raw`\bdisperse\b[^.?!]*\b(?:agent|toxin|pathogen|spore|gas|chemical|virus)\b`,
    String.raw`\b(?:ricin|anthrax|botulinum|nerve agent)\b[^.?!]*\b(?:weapon|attack|disperse|release|aerosol|poison|harm)\b`,
    String.raw`\bimprovised\s+explosive`,
  ].join("|"),
  "i",
);

// BIOTHREAT / gain-of-function scope — making a pathogen more dangerous, or culturing a select agent.
const BIOTHREAT = new RegExp(
  [
    String.raw`\bgain[\s-]of[\s-]function\b`,
    String.raw`\b(?:make|render|engineer|modify|mutate)\b[^.?!]*\b(?:more\s+)?(?:transmissible|virulent|lethal|contagious|deadly|infectious|pathogenic|drug[\s-]?resistant|vaccine[\s-]?resistant)\b`,
    String.raw`\benhance\b[^.?!]*\b(?:transmissibility|virulence|lethality|pathogenicity|infectivity)\b`,
    String.raw`\bincrease\b[^.?!]*\b(?:transmissibility|virulence|lethality|pathogenicity)\b`,
    String.raw`\b(?:culture|grow|propagate|cultivate)\b[^.?!]*\b(?:anthrax|smallpox|variola|ebola|marburg|plague|yersinia|botulinum|bacillus anthracis|h5n1|nipah)\b`,
    String.raw`\bweaponi[sz]e\b[^.?!]*\b(?:pathogen|virus|bacteria|microbe|spore)\b`,
  ].join("|"),
  "i",
);

/**
 * Decide whether a lab_draft request is in-scope. Pure + deterministic. Weaponization and biothreat
 * are checked before synthesis so a named-agent production request reports the more-severe family.
 * A hazardous scope wins over study-design framing on purpose: "design a chemical weapon …" is refused
 * despite the word "design".
 */
export function assessLabDraftScope(question: string): LabDraftScopeResult {
  if (WEAPONIZATION.test(question)) return { allowed: false, hazard: "weaponization" };
  if (BIOTHREAT.test(question)) return { allowed: false, hazard: "biothreat" };
  if (SYNTHESIS.test(question)) return { allowed: false, hazard: "synthesis" };
  return { allowed: true };
}
