// The causal-extraction benchmark: a labelled snapshot of real instructional material.
//
// 🔴 PERMANENT, NOT A ONE-OFF SCRIPT. Any change to the extractor, the prompt or the model has to
// demonstrate against this that it did not degrade precision. The corpus snapshot lives in
// `causal-benchmark.json`; the labels were authored by reading all 234 candidates on 2026-08-12.
//
// 🔴 IT TESTS THE SEMANTIC RESULT, NEVER ONE MODEL'S WORDING. Expectations below pin what an edge
// MEANS — which endpoint is the cause, which way it points, whether it was denied, whether it was
// hedged. They deliberately do not pin phrasing, so a better model that says the same thing
// differently passes.
//
// ── What the corpus said ────────────────────────────────────────────────────────────────────────
//
//   234 candidates from 8 parsed documents / 1,231 readable units
//   145  degraded-source     62%, and NOT ONE is usable — column fragments, not sentences
//    33  causal              the defensible edges
//    17  question-stem       "How will decreased CYP2D6 activity affect…?"
//     7  administrative      "Failure to adhere may result in disciplinary action"
//     7  vague
//     6  duplicate           pptx repeats notes across heading + paragraph + figure
//     5  cross-sentence      the cause is in a previous sentence
//     4  figure-description  "two vertical stacks of toy BLOCKs" matched `block`
//     3  epistemic           "you know it is DNA BECAUSE it has a T not U"
//     3  fragment
//     2  noun-phrase         "one high-risk RESULT IN their health record"
//     1  arrow-as-range      "Large DNA segments (kb → Mb)"
//     1  non-assertion       a heading reading "Cause and Effect"
//
// Trigger-word matching would therefore be 14% precise overall, 37% on structured sources alone.
// That measurement is why the production lane is model-assisted and abstain-first.

import type { CausalRelationKind } from "../knowledge-types";

import benchmark from "./causal-benchmark.json";

/** Why a candidate is not a teachable causal edge. `causal` is the only positive. */
export type CausalLabel =
  | "causal"
  /** The parse kept no structure, so the text is fragments and no edge can be grounded.
   *  🔴 NOT "no causal knowledge here" — it is "we could not reliably look". */
  | "degraded-source"
  | "question-stem"
  /** Causal in form, but course policy rather than material to be learned. */
  | "administrative"
  | "vague"
  | "duplicate"
  | "cross-sentence"
  | "figure-description"
  | "epistemic"
  | "fragment"
  | "noun-phrase"
  | "arrow-as-range"
  | "non-assertion";

export interface BenchmarkItem {
  id: string;
  /** First 8 characters of the library source id — the holdout unit. */
  source: string;
  docKind: string;
  unitId: string;
  unitType: string;
  degraded: boolean;
  triggers: string[];
  text: string;
  label: CausalLabel;
}

export const CAUSAL_BENCHMARK: BenchmarkItem[] = benchmark.items as BenchmarkItem[];

/** Every distinct document in the benchmark — the unit a holdout split is taken over. */
export const BENCHMARK_DOCUMENTS: string[] = [...new Set(CAUSAL_BENCHMARK.map((i) => i.source))].sort();

/**
 * What a correct extraction of one positive looks like, semantically.
 *
 * 🔴 A SUBSET, AND DELIBERATELY SO. Only candidates whose BOTH endpoints appear in the segment are
 * pinned. Several genuine edges are anaphoric — "the effect will generally lead to reduced protein
 * function", "Invariably, this would reduce…" — where the cause lives in a previous sentence. Those
 * stay labelled `causal` for recall, but pinning an expected cause for them would be scoring the
 * extractor against a guess rather than against the document.
 *
 * Endpoints are matched by containment after normalisation, never by exact string, so an extractor
 * that trims an article still passes.
 */
/**
 * 🔴 MATERIAL MODALITY, NOT EVERY AUXILIARY VERB.
 *
 * The zero-tolerance criterion is semantic STRENGTHENING — storing a claim broader or more certain
 * than the source made it. These change the proposition and must survive:
 *
 *   epistemic    "may", "might", "can" (as possibility), "likely", "possibly", "generally"
 *   conditional  "when X", "under Y", "in the presence of Z", "until saturation"
 *   partial      "contributed to" — the cause was contributory, not sufficient
 *
 * These do NOT change the proposition, and demanding them would make the extractor preserve
 * grammatical surface form rather than meaning:
 *
 *   tense/aspect  "will lead to" → `causes` loses nothing; the claim is the same claim
 *
 * 🔴 c020 AND c037 WERE ORIGINALLY LABELLED WITH `"will"` AND THAT WAS A BENCHMARK DEFECT, not an
 * extractor one. Scoring them as modality loss would have driven a prompt change teaching the model
 * to copy auxiliaries — surface fidelity bought at the cost of the thing actually being measured.
 * Relabelled 2026-08-12 rather than tuning the prompt to satisfy them.
 */
export interface ExpectedEdge {
  id: string;
  /** A distinctive phrase the extracted cause must contain. */
  cause: string;
  effect: string;
  relation: CausalRelationKind;
  negated: boolean;
  /** MATERIAL qualification only — see above. `null` asserts the claim is unqualified in the sense
   *  that matters, even where the sentence carries tense markers. */
  qualifier: string | null;
}

export const EXPECTED_EDGES: ExpectedEdge[] = [
  // ── plain assertions ──
  // 🔴 `qualifier: null` DESPITE "will" — future tense, not modality. See ExpectedEdge.
  { cause: "combined sequences", effect: "phenotype", id: "c020", negated: false, qualifier: null, relation: "causes" },
  { cause: "nucleotide switch", effect: "stop codon", id: "c036", negated: false, qualifier: null, relation: "causes" },
  {
    cause: "incorporation of a stop codon",
    effect: "termination",
    id: "c037",
    negated: false,
    // 🔴 `null` DESPITE "will" — the same relabel as c020, and the reason this rule is written down.
    qualifier: null,
    relation: "causes",
  },
  // ── an arrow that IS causal, unlike c048's range ──
  { cause: "gene dosage", effect: "protein levels", id: "c049", negated: false, qualifier: null, relation: "causes" },

  // ── polarity ──
  {
    cause: "additional copies",
    effect: "protein function",
    id: "c051",
    negated: false,
    qualifier: "likely",
    relation: "increases",
  },
  {
    cause: "multiple gene copies",
    effect: "protein activity",
    id: "c074",
    negated: false,
    qualifier: null,
    relation: "increases",
  },
  {
    cause: "light intensity",
    effect: "rate of photosynthesis",
    id: "c232",
    negated: false,
    qualifier: "until another factor becomes limiting",
    relation: "increases",
  },
  {
    cause: "resistance",
    effect: "current",
    id: "c234",
    negated: false,
    qualifier: "when voltage is held constant",
    relation: "decreases",
  },

  // ── 🔴 NEGATION. Getting either of these backwards teaches the opposite of the document. ──
  {
    cause: "nucleotide",
    effect: "insertion of amino acid",
    id: "c032",
    negated: true,
    qualifier: "may",
    relation: "causes",
  },
  { cause: "more light", effect: "increase", id: "c233", negated: true, qualifier: null, relation: "causes" },
];

/**
 * How the benchmark is split, and why it is not leave-one-document-out.
 *
 * 🔴 30 OF THE 33 POSITIVES LIVE IN ONE DOCUMENT. Rotating documents would put 30 positives in the
 * development fold and 3 in the test fold on one rotation and the reverse on another, so "held out"
 * would mean something different every time and the numbers could not be compared across runs.
 *
 * So the split is FIXED and stated: the one dense document is where prompts may be looked at, and
 * everything else is untouched during iteration. The held-out fold is thin on positives — 3 — and
 * that is reported rather than hidden. It is not thin on the failures that matter: it contains a
 * NEGATED edge (c233), a qualified edge (c234), seven administrative claims that must be refused,
 * and 145 degraded-source segments that must produce nothing at all.
 */
export const DEVELOPMENT_DOCUMENTS = ["9a3360d1"] as const;
export const HELD_OUT_DOCUMENTS = ["6ecc0f7b", "021f8c74", "7c696ebb", "317f3172", "81d27bd2", "d872a1c4", "3ab0ca21"] as const;

export function isHeldOut(item: BenchmarkItem): boolean {
  return (HELD_OUT_DOCUMENTS as readonly string[]).includes(item.source);
}

/** The positives, by id — recall is measured over all of them, not only the pinned subset. */
export const POSITIVE_IDS: string[] = CAUSAL_BENCHMARK.filter((i) => i.label === "causal").map((i) => i.id);

/** Everything that must NOT produce a persisted causal object.
 *
 *  🔴 `administrative` IS IN HERE ON PURPOSE. "Failure to adhere may result in disciplinary action"
 *  is a real causal claim and must never become learnable knowledge — keeping it as a negative is
 *  what stops that regressing quietly. */
export const NEGATIVE_IDS: string[] = CAUSAL_BENCHMARK.filter((i) => i.label !== "causal").map((i) => i.id);
