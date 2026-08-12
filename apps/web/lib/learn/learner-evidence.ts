// What a learner has actually demonstrated, and the state that is READ OFF that record.
//
// 🔴 THE EVIDENCE LOG IS THE TRUTH. Learner state is a projection of it and nothing else. If
// deleting the projection and rebuilding it from the log produced a different answer, the
// projection would be a second, disagreeing copy of the truth — and the disagreement would be
// invisible, because nothing compares them. `canvas-retention.ts` already works this way inside a
// canvas ("there is no `stability` column"); this is the same rule made global and durable.
//
// 🔴 ABSENCE OF EVIDENCE IS NOT NEGATIVE EVIDENCE. A learner with no evidence for an objective is
// `unknown` — not weak, not beginner, not 0%, not incorrect. This is the same defect as
// `?? "basics_known"` one layer deeper: the moment "we have not asked" is stored as "they cannot",
// every later decision is made against a claim about a person that nobody ever observed.

import type { ObjectiveCapability } from "./learning-objective";

/**
 * Two INDEPENDENT facts, kept independent.
 *
 * 🔴 COLLAPSING THESE INTO ONE `outcome` IS THE MISTAKE THIS SHAPE EXISTS TO PREVENT. "The learner
 * revealed the answer instead of attempting it" and "the learner answered and was wrong" are not
 * the same event, and a single column forces the first into the second — which is absence of
 * evidence recorded as negative evidence, wearing a new name.
 *
 * The existing code already knows this. `Verdict` has no value for a reveal, `revealed` sits BESIDE
 * `evaluation` on a response, and `canvas-scheduling.ts` reads it BEFORE the verdict. So: was a
 * demonstration obtained at all, and — only if it was — what did it show.
 */
export interface LearnerEvidence {
  /** Stable id. Used to deduplicate, so replaying a log twice cannot change the answer. */
  id: string;
  objectiveIdentityKey: string;
  /** ISO. When the learner did the thing, not when the row was written. */
  occurredAt: string;
  /**
   * Whether any usable demonstration came back.
   *
   * False covers revealing the answer, giving up, and a response the evaluator could not read.
   * All three mean the same thing for learning: an opportunity was given and we still do not know.
   */
  demonstrationObtained: boolean;
  /** What the demonstration showed. 🔴 NULL WHENEVER NONE WAS OBTAINED — never a stand-in verdict. */
  verdict: EvidenceVerdict | null;
  /** 0-1, how much the response actually settled. A correct one-liner to a broad task is weak. */
  confidence?: number;
  /** Named competing models, when the verdict is `misconception`. Kept so they can be taught against. */
  misconceptions?: readonly string[];
  /** Which canvas produced it — provenance only. 🔴 NEVER a filter for reading state back: the
   *  whole point is that a second canvas sees what the first one established. */
  canvasId?: string | null;
  /** Which evaluator made the claim. Evidence from a different evaluator is a different claim, and
   *  after the fact there is no other way to tell them apart. Not part of any key — nothing keys
   *  on it — but recorded for the same reason identity keys carry their version. */
  evaluatorVersion?: string | null;

  /**
   * WHICH SINGLE LEARNER ACTION PRODUCED THIS OBSERVATION.
   *
   * 🔴 ONE PERFORMANCE, MANY OBSERVATIONS — and they are not the same thing. A learner who
   * explains "ACE inhibition lowers angiotensin II, which lowers aldosterone, reducing potassium
   * secretion" has answered ONCE and demonstrated THREE causal edges. Three objectives, three
   * rows, one performance, one twenty-second latency.
   *
   * 🔴 THE DATABASE ALREADY ENFORCES THE HALF THAT MATTERS PER OBJECTIVE. The unique constraint
   * is `(user_id, objective_id, response_id)`, so one response can never produce two rows for the
   * SAME objective — which is why `demonstrationCount` below is already honest and is deliberately
   * left alone. What was missing is the other half: nothing could tell that rows for DIFFERENT
   * objectives came from one answer.
   *
   * 🔴 THIS IS AN OBSERVATION, NOT AN INFERENCE. It records that these judgements share an origin.
   * It does NOT claim that three edges in one sentence are worth more, or less, than the same
   * three demonstrated separately — that reading is real and important, and it belongs to the
   * layer above, where it can be revised without rewriting a single row of what happened.
   *
   * Absent means not observed. Legacy rows have none, and `performanceKey` treats each of them as
   * its own performance, which is exactly what they were.
   */
  responseId?: string | null;

  // ── Observations about the attempt ────────────────────────────────────────
  //
  // 🔴 RAW MEASUREMENTS, AND NOTHING READS THEM YET. They are carried so the record is complete,
  // not because the projection below has started using them — `projectLearnerState` ignores all
  // three, and a test asserts that it does. Inference over them is a later, separate step, and
  // keeping the two apart is exactly what lets Nemesis change its mind about what 14 seconds means
  // without corrupting a single row of what actually happened.
  //
  // 🔴 ABSENT MEANS NOT OBSERVED. Never zero, never a default, never backfilled.

  /** Which cognitive operation the prompt demanded. */
  operation?: ObjectiveCapability;
  /**
   * Milliseconds from the prompt appearing to the answer being submitted.
   *
   * 🔴 RAW, AND IT MUST STAY RAW. Nothing may store a band, a percentile or a verdict about this.
   * Time means different things for different operations — 15 seconds is slow for an association
   * and unremarkable for a causal explanation — so any interpretation depends on context this row
   * does not hold, and burying one here would make it permanent.
   */
  responseLatencyMs?: number;
  /** How much assistance the runtime offered during the attempt. 0 is the prompt alone.
   *  🔴 What was OFFERED, not whether the learner needed it. */
  scaffoldingLevel?: number;
  /**
   * What the learner actually wrote or said, verbatim.
   *
   * 🔴 THE LANGUAGE OF AN ANSWER IS EVIDENCE, AND A VERDICT DISCARDS IT. "It blocks the receptor"
   * and "AT1 blockade reduces aldosterone" can both be judged correct while showing different
   * command of the vocabulary; which terms a learner reaches for, and which they never use, is a
   * signal no five-value verdict can carry. Kept raw so a better evaluator can re-read it.
   */
  responseText?: string | null;
  /** Which task produced this. Provenance only — 🔴 never a filter for reading state back. */
  taskId?: string | null;
}

/**
 * The identity of the one learner action an observation belongs to.
 *
 * 🔴 THE FALLBACK IS NOT A DEFAULT, IT IS THE HISTORICAL TRUTH. Every row written before response
 * ids were carried came from a surface that produced exactly one row per answer, so treating such
 * a row as its own performance is not a guess standing in for missing data — it is what actually
 * happened. That is why this is a function and not a backfill: rewriting those rows would invent
 * a shared origin that no learner ever created.
 */
export function performanceKey(evidence: LearnerEvidence): string {
  return evidence.responseId ?? evidence.id;
}

/**
 * Group a log by the learner action each observation came from.
 *
 * 🔴 THIS IS WHAT MAKES "ONE ANSWER" COUNTABLE. Without it the only available question is "how
 * many rows?", and the charter's invariant — never infer the number of attempts from the number
 * of evidence rows — cannot even be expressed, let alone held.
 *
 * Insertion order follows first appearance, so a caller that sorted the log by time gets
 * performances in the order they occurred.
 */
export function performancesIn(
  evidence: readonly LearnerEvidence[],
): Map<string, readonly LearnerEvidence[]> {
  const byPerformance = new Map<string, LearnerEvidence[]>();
  const seenRows = new Set<string>();
  for (const row of evidence) {
    // Rows are deduplicated by their own id first: a log assembled from two overlapping reads
    // would otherwise report one answer twice, which is the very miscount this exists to prevent.
    if (seenRows.has(row.id)) continue;
    seenRows.add(row.id);
    const key = performanceKey(row);
    const existing = byPerformance.get(key);
    if (existing) existing.push(row);
    else byPerformance.set(key, [row]);
  }
  return byPerformance;
}

/** The judged outcomes. Mirrors the existing `Verdict` in canvas-model.ts, which is deliberate:
 *  this is that same judgement made durable, not a second opinion about what a verdict can be. */
export type EvidenceVerdict = "strong" | "understood" | "partial" | "incorrect" | "misconception";

/**
 * What Nemesis believes about one learner and one objective.
 *
 * 🔴 `unknown` IS A REAL VALUE AND MUST STAY REPRESENTABLE. It is not a null to be coalesced away,
 * and it is not the bottom of a scale — it sits outside the ordering entirely. "We have never
 * asked" and "they got it wrong" call for opposite teaching, and a type that cannot say the first
 * will quietly say the second.
 */
export type LearnerObjectiveStatus =
  /** No relevant evidence exists. Nemesis does not know. */
  | "unknown"
  /** An opportunity was given and no usable demonstration came back — revealed, gave up, or
   *  unreadable. 🔴 DISTINCT FROM `incorrect`: nothing was shown, so nothing was contradicted. */
  | "not_demonstrated"
  /** The learner produced something that contradicts the objective. */
  | "incorrect"
  /** Evidence supports a specific competing model, not merely an error — so it can be taught
   *  against rather than simply retried. */
  | "misconception"
  /** Some of what the objective requires was demonstrated. */
  | "partial"
  /** The objective was demonstrated. */
  | "correct";

export interface LearnerObjectiveState {
  objectiveIdentityKey: string;
  status: LearnerObjectiveStatus;
  /** How many distinct pieces of evidence exist. 0 exactly when the status is `unknown`. */
  evidenceCount: number;
  /** How many of those obtained an actual demonstration. Lower than `evidenceCount` when the
   *  learner revealed or gave up, and the gap is itself informative. */
  demonstrationCount: number;
  /** ISO of the most recent evidence, or null when there is none. */
  lastEvidenceAt: string | null;
  /** The most recent judged verdict, or null if none was ever obtained. Kept because `strong` and
   *  `understood` both project to `correct`, and a policy may reasonably treat them differently. */
  latestVerdict: EvidenceVerdict | null;
}

function statusFor(verdict: EvidenceVerdict): LearnerObjectiveStatus {
  switch (verdict) {
    // Both are demonstrations of the objective. The strength difference is preserved on
    // `latestVerdict` rather than being flattened into a status the policy cannot un-flatten.
    case "strong":
    case "understood":
      return "correct";
    case "partial":
      return "partial";
    case "misconception":
      return "misconception";
    case "incorrect":
      return "incorrect";
  }
}

/**
 * Read the state off the log.
 *
 * 🔴 ORDER-INDEPENDENT AND IDEMPOTENT, AND BOTH ARE LOAD-BEARING. "Recomputable from the log" is
 * only true if the same evidence produces the same state however it arrives and however many times
 * a row appears — rows come back from a database in whatever order it likes, and a replay or a
 * retried write can deliver one twice. So: deduplicate by id, then sort by time with the id as the
 * tiebreak. Sorting on time alone leaves ties resolved by input order, which is exactly the kind of
 * hidden order-dependence that makes a projection disagree with itself.
 */
export function projectLearnerState(
  objectiveIdentityKey: string,
  evidence: readonly LearnerEvidence[],
): LearnerObjectiveState {
  const distinct = [...new Map(evidence.map((e) => [e.id, e])).values()]
    .filter((e) => e.objectiveIdentityKey === objectiveIdentityKey)
    .sort((a, b) => {
      const byTime = Date.parse(a.occurredAt) - Date.parse(b.occurredAt);
      return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
    });

  // 🔴 NO EVIDENCE IS `unknown`, FULL STOP. Not a default, not a floor, not "assume the worst".
  if (distinct.length === 0) {
    return {
      demonstrationCount: 0,
      evidenceCount: 0,
      lastEvidenceAt: null,
      latestVerdict: null,
      objectiveIdentityKey,
      status: "unknown",
    };
  }

  const latest = distinct[distinct.length - 1]!;
  const demonstrations = distinct.filter((e) => e.demonstrationObtained && e.verdict);
  const latestDemonstration = demonstrations[demonstrations.length - 1] ?? null;

  return {
    demonstrationCount: demonstrations.length,
    evidenceCount: distinct.length,
    lastEvidenceAt: latest.occurredAt,
    latestVerdict: latestDemonstration?.verdict ?? null,
    objectiveIdentityKey,
    // The most recent event decides the current status: someone who has just corrected a
    // misconception is not still holding it, and the history remains in the log either way. When
    // that event obtained nothing, the honest status is `not_demonstrated` — an opportunity passed
    // and we still do not know, which is different from having been shown a wrong answer.
    status: latest.demonstrationObtained && latest.verdict ? statusFor(latest.verdict) : "not_demonstrated",
  };
}

/** Project every objective present in a log at once, for a canvas asking "what does this learner
 *  already hold?" across a whole source. Objectives with no evidence are simply absent — a caller
 *  that needs them must ask for them by key and receive `unknown`, rather than this function
 *  inventing rows for objectives it was never told about. */
export function projectAll(evidence: readonly LearnerEvidence[]): Map<string, LearnerObjectiveState> {
  const keys = [...new Set(evidence.map((e) => e.objectiveIdentityKey))];
  return new Map(keys.map((key) => [key, projectLearnerState(key, evidence)]));
}
