// The cross-domain causal challenge set — does the extraction CONTRACT generalise?
//
// 🔴 THIS IS NOT EVIDENCE OF PREVALENCE, AND MUST NEVER BE REPORTED AS IF IT WERE. Every segment
// below is hand-authored. It answers one question — "does the contract hold outside molecular
// biology?" — and it is deliberately much harder than real material. `causal-benchmark.ts` remains
// the only source of truth for how often causal knowledge actually appears and how it actually
// fails. The two are reported separately, never averaged into one flattering number.
//
// 🔴 FROZEN BEFORE THE EXTRACTION PROMPT WAS WRITTEN, on purpose. The real corpus has 30 of its 33
// positives in a single pharmacogenomics lecture, so a prompt tuned on it could read molecular
// prose beautifully and generalise to nothing. Authoring these first — and never looking at them
// while iterating — is the only way that question gets an honest answer.
//
// Eight domains, and every hard case the benchmark taught us to expect: correlation dressed as
// causation, sequence without causation, questions, hypotheticals, epistemic "because", ambiguous
// antecedents, negation, modality, and administrative consequences.
//
// 🔴 ONE DISTINCTION THIS SET EXISTS TO PIN: course administration is not subject matter, but
// subject matter can be administrative in FORM. "Students who miss two sessions will be withdrawn"
// is about the course. "Filing after the deadline results in dismissal of the claim" is substantive
// law a student must learn. Both read like policy; only one is knowledge. Getting this wrong in
// either direction is a failure — refusing real legal knowledge, or teaching someone the syllabus.

import type { CausalRelationKind } from "../knowledge-types";

export type ChallengeDomain =
  | "medicine"
  | "biology"
  | "chemistry"
  | "physics"
  | "engineering"
  | "economics"
  | "history"
  | "law";

/** Why a segment is not a teachable causal edge. Mirrors the real-corpus labels where they overlap. */
export type ChallengeLabel =
  | "causal"
  | "correlation"
  | "sequence"
  | "question"
  | "hypothetical"
  | "administrative"
  | "epistemic"
  | "ambiguous-antecedent"
  | "not-causal";

export interface ChallengeItem {
  id: string;
  domain: ChallengeDomain;
  text: string;
  label: ChallengeLabel;
  /** Set only when `label` is "causal". Endpoints match by containment after normalisation. */
  expect?: {
    cause: string;
    effect: string;
    relation: CausalRelationKind;
    negated: boolean;
    qualifier: string | null;
  };
  /** Why this item is here, for whoever reads a failure. */
  note?: string;
}

export const CAUSAL_CHALLENGE: ChallengeItem[] = [
  // ── medicine / pharmacology ────────────────────────────────────────────────
  {
    domain: "medicine",
    expect: { cause: "beta-blockade", effect: "cardiac output", negated: false, qualifier: null, relation: "decreases" },
    id: "x01",
    label: "causal",
    text: "Beta-blockade reduces cardiac output by slowing the sinoatrial node.",
  },
  {
    domain: "medicine",
    id: "x02",
    label: "correlation",
    note: "Rates observed together, mechanism explicitly disclaimed. Must not become an edge.",
    text: "Patients taking this agent showed higher rates of cough, though the mechanism remains unclear.",
  },
  { domain: "medicine", id: "x03", label: "question", text: "Does aspirin prevent secondary myocardial infarction?" },
  {
    domain: "medicine",
    expect: { cause: "aspirin", effect: "primary myocardial infarction", negated: true, qualifier: null, relation: "prevents" },
    id: "x04",
    label: "causal",
    note: "🔴 Negation. Inverting this teaches the opposite of the source.",
    text: "Aspirin does not prevent primary myocardial infarction in low-risk adults.",
  },
  {
    domain: "medicine",
    expect: { cause: "warfarin", effect: "bleeding risk", negated: false, qualifier: "may", relation: "increases" },
    id: "x05",
    label: "causal",
    note: "🔴 Modality. Dropping 'may' asserts what the source hedged.",
    text: "Warfarin therapy may increase bleeding risk in patients over 75.",
  },

  // ── biology ────────────────────────────────────────────────────────────────
  {
    domain: "biology",
    expect: { cause: "loss of the promoter region", effect: "transcription", negated: false, qualifier: null, relation: "prevents" },
    id: "x06",
    label: "causal",
    text: "Loss of the promoter region prevents transcription of the downstream gene.",
  },
  {
    domain: "biology",
    id: "x07",
    label: "not-causal",
    note: "An action a thing performs, not a claim that one state changes another.",
    text: "Chlorophyll absorbs light most strongly in the blue and red wavelengths.",
  },
  {
    domain: "biology",
    id: "x08",
    label: "sequence",
    note: "Order in time. 'After' is not 'because of'.",
    text: "After the cell divides, the daughter cells enter interphase.",
  },
  {
    domain: "biology",
    id: "x09",
    label: "epistemic",
    note: "'because' introduces the reason we BELIEVE something, not a cause in the world.",
    text: "We infer the sample is prokaryotic because it lacks a nucleus.",
  },
  {
    domain: "biology",
    expect: {
      cause: "substrate concentration",
      effect: "reaction velocity",
      negated: false,
      qualifier: "until the enzyme saturates",
      relation: "increases",
    },
    id: "x10",
    label: "causal",
    note: "🔴 The qualifier is a bounding condition, not a hedge. Losing it overstates the claim.",
    text: "Increased substrate concentration raises reaction velocity until the enzyme saturates.",
  },

  // ── chemistry ──────────────────────────────────────────────────────────────
  {
    domain: "chemistry",
    expect: { cause: "adding a catalyst", effect: "activation energy", negated: false, qualifier: null, relation: "decreases" },
    id: "x11",
    label: "causal",
    text: "Adding a catalyst lowers the activation energy of the reaction.",
  },
  {
    domain: "chemistry",
    expect: { cause: "the inhibitor", effect: "substrate access", negated: false, qualifier: null, relation: "prevents" },
    id: "x12",
    label: "causal",
    note: "🔴 RELABELLED 2026-08-12. Was pinned to `inhibits` on a mechanism-vs-outcome heuristic that turned out to be too brittle to be ontology law. `sourceVerb` keeps the author's actual word (\"blocks\"); the normalised relation is deliberately coarser and replaceable.",
    text: "The competitive inhibitor blocks substrate access to the active site.",
  },
  {
    domain: "chemistry",
    id: "x13",
    label: "hypothetical",
    note: "A counterfactual the author is exploring, not a relationship they assert.",
    text: "Suppose the temperature were doubled; the rate would roughly quadruple.",
  },
  {
    domain: "chemistry",
    id: "x14",
    label: "correlation",
    note: "'rises with' states co-variation. The source does not say one drives the other.",
    text: "Solubility rises with temperature for most ionic solids.",
  },
  {
    domain: "chemistry",
    expect: { cause: "excess acid", effect: "the equilibrium", negated: true, qualifier: "once the buffer is saturated", relation: "causes" },
    id: "x15",
    label: "causal",
    note: "🔴 Negation AND a bounding condition in one sentence.",
    text: "Adding excess acid does not shift the equilibrium once the buffer is saturated.",
  },

  // ── physics ────────────────────────────────────────────────────────────────
  {
    domain: "physics",
    expect: { cause: "distance between the charges", effect: "electrostatic force", negated: false, qualifier: null, relation: "decreases" },
    id: "x16",
    label: "causal",
    text: "Doubling the distance between the charges reduces the electrostatic force to one quarter.",
  },
  {
    domain: "physics",
    id: "x17",
    label: "not-causal",
    note: "Dependence without a stated direction of change. Picking one would invent it.",
    text: "The period of a simple pendulum depends on its length and not on its mass.",
  },
  { domain: "physics", id: "x18", label: "question", text: "Why does a heavier object fall at the same rate as a lighter one?" },
  {
    domain: "physics",
    expect: { cause: "friction", effect: "heat", negated: false, qualifier: null, relation: "causes" },
    id: "x19",
    label: "causal",
    text: "Friction converts kinetic energy into heat.",
  },
  {
    domain: "physics",
    id: "x20",
    label: "sequence",
    text: "Superconductivity was first observed shortly after the liquefaction of helium became possible.",
  },

  // ── engineering ────────────────────────────────────────────────────────────
  {
    domain: "engineering",
    expect: { cause: "preloading the bolt", effect: "joint separation", negated: false, qualifier: "under cyclic load", relation: "prevents" },
    id: "x21",
    label: "causal",
    text: "Preloading the bolt prevents joint separation under cyclic load.",
  },
  {
    domain: "engineering",
    id: "x22",
    label: "not-causal",
    text: "The controller samples the sensor every ten milliseconds.",
  },
  {
    domain: "engineering",
    expect: { cause: "adding a damper", effect: "overshoot", negated: false, qualifier: null, relation: "decreases" },
    id: "x23",
    label: "causal",
    note: "Two edges in one sentence; the pinned one is the first. A second edge is not an error.",
    text: "Adding a damper reduces overshoot but lengthens the settling time.",
  },
  {
    domain: "engineering",
    expect: { cause: "the housing was reseated", effect: "the shim stack relaxed", negated: false, qualifier: null, relation: "causes" },
    id: "x24",
    label: "causal",
    note: "🔴 A genuinely causal 'because', to be told apart from x09's epistemic one.",
    text: "The shim stack relaxed because the housing was reseated.",
  },
  {
    domain: "engineering",
    id: "x25",
    label: "administrative",
    note: "A consequence for a PERSON under a policy, not a fact about the world.",
    text: "Failure to torque the fasteners to specification may result in rejection of the warranty claim.",
  },

  // ── economics ──────────────────────────────────────────────────────────────
  {
    domain: "economics",
    expect: { cause: "a rise in interest rates", effect: "consumer borrowing", negated: false, qualifier: "typically", relation: "decreases" },
    id: "x26",
    label: "causal",
    text: "A rise in interest rates typically reduces consumer borrowing.",
  },
  {
    domain: "economics",
    id: "x27",
    label: "correlation",
    note: "'tend to have' is association. The classic case that must never become an edge.",
    text: "Countries with higher education spending tend to have higher GDP per capita.",
  },
  {
    domain: "economics",
    expect: { cause: "price controls", effect: "supply", negated: true, qualifier: null, relation: "increases" },
    id: "x28",
    label: "causal",
    note: "🔴 Negation of an increase — inverting it reverses the economics.",
    text: "Price controls do not increase supply.",
  },
  {
    domain: "economics",
    expect: { cause: "the tariff", effect: "raise prices", negated: false, qualifier: null, relation: "enables" },
    id: "x29",
    label: "causal",
    note: "enables — it made something possible rather than producing it.",
    text: "The tariff enabled domestic producers to raise prices without losing market share.",
  },
  {
    domain: "economics",
    id: "x30",
    label: "hypothetical",
    text: "If the central bank were to cut rates, investment would likely rise.",
  },

  // ── history / social science ───────────────────────────────────────────────
  {
    domain: "history",
    expect: { cause: "collapse of the harvest", effect: "unrest", negated: false, qualifier: null, relation: "contributes_to" },
    id: "x31",
    label: "causal",
    note: "🔴 RELABELLED 2026-08-12, and it is the item that motivated the seventh relation. It was pinned as `causes` + qualifier \"contributed to\", which treated partial causation as a hedge. It is not a hedge: the author is CONFIDENT about a PARTIAL role. `contributes_to` carries that, and the qualifier field goes back to meaning uncertainty and scope only.",
    text: "The collapse of the harvest in 1788 contributed to the unrest of the following year.",
  },
  { domain: "history", id: "x32", label: "sequence", text: "The treaty was signed three months after the armistice." },
  {
    domain: "history",
    id: "x33",
    label: "correlation",
    note: "The source explicitly denies a connection. An edge here would contradict the document.",
    text: "Literacy rates rose over the same period, but the two trends are not thought to be connected.",
  },
  {
    domain: "history",
    expect: { cause: "compulsory schooling laws", effect: "years of education", negated: false, qualifier: null, relation: "increases" },
    id: "x34",
    label: "causal",
    text: "Compulsory schooling laws increased the average number of years of education completed.",
  },
  { domain: "history", id: "x35", label: "question", text: "Was the railway the primary driver of nineteenth-century urban growth?" },

  // ── law / policy ───────────────────────────────────────────────────────────
  {
    domain: "law",
    expect: { cause: "the statute", effect: "dismissing a worker", negated: false, qualifier: null, relation: "prevents" },
    id: "x36",
    label: "causal",
    text: "The statute prevents an employer from dismissing a worker for union membership.",
  },
  {
    domain: "law",
    expect: { cause: "filing after the deadline", effect: "dismissal of the claim", negated: false, qualifier: null, relation: "causes" },
    id: "x37",
    label: "causal",
    note: "🔴 THE HARD ONE. Administrative in FORM, but substantive law a student must learn. Compare x39, which is about the course rather than the subject. Refusing this would make Nemesis unable to teach whole disciplines.",
    text: "Filing after the limitation deadline results in dismissal of the claim.",
  },
  {
    domain: "law",
    expect: { cause: "lacked consideration", effect: "unenforceable", negated: false, qualifier: null, relation: "causes" },
    id: "x38",
    label: "causal",
    note: "A justificatory 'because' that IS the legal mechanism, unlike x09.",
    text: "The court held the clause was unenforceable because it lacked consideration.",
  },
  {
    domain: "law",
    id: "x39",
    label: "administrative",
    note: "🔴 About the COURSE, not the subject. The counterpart to x37.",
    text: "Students who miss more than two sessions will be withdrawn from the module.",
  },
  { domain: "law", id: "x40", label: "question", text: "Does strict liability require proof of intent?" },

  // ── ambiguous antecedents, any domain ──────────────────────────────────────
  {
    domain: "engineering",
    id: "x41",
    label: "ambiguous-antecedent",
    note: "'This' is not in the segment. Resolving it would be inference outside the allowed context.",
    text: "This significantly reduces the error rate.",
  },
  {
    domain: "economics",
    id: "x42",
    label: "ambiguous-antecedent",
    text: "As a result, throughput improved over the following quarter.",
  },
];

export const CHALLENGE_DOMAINS: ChallengeDomain[] = [
  ...new Set(CAUSAL_CHALLENGE.map((i) => i.domain)),
];
