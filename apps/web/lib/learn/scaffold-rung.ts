// At what cognitive demand a response was produced — §33, "scaffolding is part of the evidence".
//
// 🔴 THE OWNER'S CASE, WHICH IS THE WHOLE REASON THIS TYPE EXISTS:
//
//     "If two learners eventually say 'active site,' but one produced it independently while
//      another required three cues, those responses are not equivalent evidence."
//
// 🔴 ONE ORDERED AXIS, NOT A MODALITY FLAG PLUS A CONFIDENCE NUMBER. An earlier design recorded
// "was it multiple choice?" beside "how sure are we?", which flattens a partial order into a scalar
// and is exactly how *"recognised HTN"* becomes *"knows HTN"* and the learner is skipped past it.
// §6's hierarchy — independent production > guided production > discrimination > recognition — is
// the SAME ladder as §33's, so there is one scale and a response records the rung it was produced
// at. The partial order is then built into the type rather than asserted in a comment:
//
//     production implies recognition        entails("independent", "recognition")  === true
//     recognition implies nothing above it  entails("recognition", "independent")  === false
//
// 🔴 IT IS A PROPERTY OF THE TASK, NOT A JUDGEMENT ABOUT THE LEARNER, which is what puts it on the
// observation side of `learner-store.ts`'s line — "what was measured, never what it means". The
// runtime knows which rung it offered before the learner answers. Nothing here is inferred from the
// response, so no later change of mind about what a rung means can invalidate a stored row.
//
// 🔴 AND THE LEARNER NEVER SEES IT. §33: "The learner never sees a difficulty setting change. The
// Canvas simply changes the task."

/**
 * The ladder, from the most demanding to the least.
 *
 * 🔴 THE RUNGS ARE DIFFERENT KINDS OF TASK, NOT AMOUNTS OF HELP, which is why this is a named union
 * and not the `smallint` that already exists beside it. A learner shown five options has not been
 * given "four units of assistance" — they have been asked a different question, one that can be
 * answered by discriminating rather than by producing. An integer invites arithmetic on a scale
 * where the distance between rungs means nothing.
 */
export type ScaffoldRung =
  /** The question and nothing else. The learner produced the answer unaided. */
  | "independent"
  /** The question pointed at a smaller region than the objective covers, without giving the answer
   *  away — §33's "What happens when substrate concentration becomes very high?" */
  | "narrowed"
  /** Part of the answer was present: a blank to fill, a stem, a first letter. */
  | "cued"
  /** The answer was among options on screen. Discrimination, not production. */
  | "recognition"
  /** Nemesis supplied the answer. 🔴 A REAL RUNG AND NOT AN ABSENCE — being told is what happened,
   *  and a row recording it says an opportunity was spent without the learner producing anything.
   *  Leaving it null would make "we taught them" indistinguishable from "we never asked". */
  | "taught";

/**
 * Weakest first. 🔴 THE ONLY PLACE THE ORDER IS WRITTEN DOWN — every comparison below is derived
 * from this array, so the ladder cannot be reordered in one place and left stale in another.
 */
const LADDER: readonly ScaffoldRung[] = ["taught", "recognition", "cued", "narrowed", "independent"];

export const SCAFFOLD_RUNGS: readonly ScaffoldRung[] = LADDER;

/** Where a rung sits on the ladder. Higher is more demanding. Comparable, never arithmetic. */
export function rungRank(rung: ScaffoldRung): number {
  return LADDER.indexOf(rung);
}

/**
 * Does a response produced at `produced` establish what a task at `required` would have?
 *
 * 🔴 THIS IS THE ONE RULE THE STORE MUST NEVER LET SOMETHING ROUND. Producing an answer unaided
 * establishes that you could also have picked it from a list; picking it from a list establishes
 * nothing about producing it. A single confidence number cannot express that, because it is not a
 * matter of degree — it is a direction.
 */
export function entails(produced: ScaffoldRung, required: ScaffoldRung): boolean {
  return rungRank(produced) >= rungRank(required);
}

/** The more demanding of two rungs — the honest summary of what a learner has ever managed. */
export function higherRung(a: ScaffoldRung, b: ScaffoldRung): ScaffoldRung {
  return rungRank(a) >= rungRank(b) ? a : b;
}

/**
 * A stored value, back as a rung — or null when the row does not say.
 *
 * 🔴 NULL IS "NOT RECORDED", NEVER A DEFAULT RUNG. Every row written before this column existed has
 * no rung, and guessing one would retroactively claim something about a demonstration nobody
 * observed at that grain. Defaulting to `independent` would credit old rows with unaided production;
 * defaulting to `taught` would erase demonstrations that really happened. Both are false claims
 * about a real learner, so the absence is carried instead.
 */
export function readRung(value: unknown): ScaffoldRung | null {
  return typeof value === "string" && (LADDER as readonly string[]).includes(value)
    ? (value as ScaffoldRung)
    : null;
}

/**
 * What one objective's evidence says about it — §36 of the brief, and the keystone §17, §28 and §29
 * all depend on.
 *
 * 🔴 `not_addressed` IS THE VALUE THIS TYPE EXISTS FOR. One answer can be put to several objectives
 * at once, and the owner's case is exact: asked to explain phase 0, *"Sodium enters the cell,
 * causing rapid depolarization"* demonstrates that Na⁺ is the inward ion and that influx causes
 * depolarization, and says NOTHING about why Na⁺ moves inward. Nemesis must not infer the third
 * because the overall answer was good.
 *
 * 🔴 AND IT IS DISTINCT FROM `not_demonstrated`, WHICH IS A DIFFERENT FACT. `not_demonstrated` means
 * the learner was asked and produced nothing usable — they revealed, gave up, or were unreadable.
 * `not_addressed` means they answered ably and this particular objective simply was not part of
 * what they said. One is a failed attempt; the other is not an attempt at all. Collapsing them
 * teaches the wrong thing: the first calls for scaffolding, the second calls for asking.
 */
export type ObjectiveEvidence =
  /** The response established this objective. */
  | "demonstrated"
  /** Part of what this objective requires was established, and part was missing. */
  | "partial"
  /** The response asserted something this objective contradicts. */
  | "contradicted"
  /** The response said nothing either way about this objective. */
  | "not_addressed";
