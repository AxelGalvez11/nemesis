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

import { TRUSTED_ENOUGH_TO_UPDATE_STATE } from "./canvas-judge";
import type { ErrorType, LearnerInputModality } from "./canvas-model";
import type { ObjectiveCapability } from "./learning-objective";
import { entails, higherRung, type ObjectiveEvidence, type ScaffoldRung } from "./scaffold-rung";
import type { TeachingStrategyId } from "./teaching-strategy";

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
  /**
   * 0-1, HOW SURE THE EVALUATOR WAS OF ITS OWN VERDICT. A fact about the judgement, never about
   * the learner.
   *
   * 🔴 THIS COMMENT USED TO SAY "how much the response actually settled. A correct one-liner to a
   * broad task is weak" — which describes DEMONSTRATION STRENGTH, and is not what the field holds.
   * The value written here is the judge's certainty, and the two are close enough to be confused
   * and opposite enough to matter. Measured, on identical objectives:
   *
   *     "valsartan"                                       0.95
   *     "that would be valsartan, the ARB it is sold as"  0.50   <- the MORE informative answer
   *
   * Read as strength, that makes a learner who explains their reasoning accumulate systematically
   * weaker evidence than one typing bare tokens — the exact opposite of what free-response
   * retrieval exists to reward, and an inversion of §4's own worked example.
   *
   * 🔴 NOTHING WEIGHTS IT TODAY, AND THE CORRECTION IS THE POINT. `projectLearnerState` ignores it
   * and a test asserts that it does; the teaching policy never reads it. So this was never a live
   * misuse — it was a label that would have caused one the moment a consumer believed it. That is
   * why the fix is a comment and not a migration.
   *
   * 🔴 WHAT IT IS FOR: deciding whether a verdict may update learner state AT ALL — see
   * `TRUSTED_ENOUGH_TO_UPDATE_STATE`. Strength of demonstration comes from what the answer
   * CONTAINED, and the raw observations for that are already on this row.
   */
  confidence?: number;
  /** Named competing models, when the verdict is `misconception`. Kept so they can be taught against. */
  misconceptions?: readonly string[];
  /**
   * Which KIND of failure the evaluator established — the diagnosis behind the verdict.
   *
   * 🔴 THE DISTINCTION `verdict` CANNOT CARRY. Two learners can both be `incorrect` on the same
   * objective, one having applied the right method and slipped in the arithmetic and the other
   * having reached for a method that does not apply. Those are not the same learner and they are
   * not owed the same next move; without this field they are the same row.
   *
   * 🔴 ABSENT MEANS NO KIND WAS NAMED, and a consumer must treat that as "we do not know" rather
   * than as any particular kind. Every row written before this column existed reads back absent,
   * and so does every row whose judge declined to say.
   */
  errorType?: ErrorType;
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
  /** At what rung of the scaffolding ladder this response was produced — §33. Absent on every row
   *  written before the rung was recorded, which is why nothing may default it. */
  scaffoldRung?: ScaffoldRung;
  /** What this response said about THIS objective, including "nothing at all". */
  objectiveEvidence?: ObjectiveEvidence;
  /**
   * What the learner actually wrote or said, verbatim.
   *
   * 🔴 THE LANGUAGE OF AN ANSWER IS EVIDENCE, AND A VERDICT DISCARDS IT. "It blocks the receptor"
   * and "AT1 blockade reduces aldosterone" can both be judged correct while showing different
   * command of the vocabulary; which terms a learner reaches for, and which they never use, is a
   * signal no five-value verdict can carry. Kept raw so a better evaluator can re-read it.
   */
  responseText?: string | null;
  /** How the response was produced. Raw provenance; never interpreted as ability by this layer. */
  responseModality?: LearnerInputModality;
  /** Which task produced this. Provenance only — 🔴 never a filter for reading state back. */
  taskId?: string | null;
  /**
   * Which teaching controller chose the opportunity this row came out of.
   *
   * 🔴 AN OBSERVATION ABOUT THE OPPORTUNITY, WHICH IS WHY IT SITS IN THIS BLOCK AND NOWHERE NEAR
   * `verdict`. It records who decided to put this question in front of this person at this moment.
   * It says nothing about the person, and nothing may ever read it as though it did — a projection
   * that treated one arm's evidence as weaker would be interpreting the experiment into the learner
   * model, which is the exact "inference stored as observation" defect the whole block forbids.
   *
   * 🔴 NOTHING IN THE TEACHING LOOP READS IT. `projectLearnerState` ignores it and a test asserts
   * that it does. Both arms produce the same kind of evidence about the same objectives, so a
   * learner's state must come out identical whichever controller asked — otherwise the arm would be
   * changing the measurement as well as the teaching, and no comparison between them would mean
   * anything. It exists to be GROUPED BY, afterwards, in `strategy-outcomes.ts`.
   *
   * 🔴 ABSENT MEANS THE ROW PREDATES THE STRATEGY LAYER. Never defaulted, never backfilled — see
   * `20260814T03_evidence_teaching_strategy.sql`. It never means `nemesis_policy`.
   */
  teachingStrategy?: TeachingStrategyId | null;
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
  /**
   * How many distinct pieces of evidence exist — every row, however its verdict was read.
   *
   * 🔴 THIS USED TO SAY "0 exactly when the status is `unknown`", AND THAT STOPPED BEING TRUE. A
   * learner can now hold evidence while the status is `unknown`: they answered, and the judge was
   * not sure enough of its own reading for anything to be concluded from it. The opportunity
   * happened — so it is counted — and nothing was established — so nothing is claimed. The two
   * facts are genuinely independent, and the old sentence quietly asserted they could not be.
   */
  evidenceCount: number;
  /** How many of those obtained an actual demonstration Nemesis is willing to stand behind. Lower
   *  than `evidenceCount` when the learner revealed or gave up, or when a reading was too uncertain
   *  to conclude from — and the gap is itself informative. */
  demonstrationCount: number;
  /**
   * The most demanding rung at which this objective was ever actually demonstrated — §33.
   *
   * 🔴 THE HIGHEST, NOT THE LATEST, AND THE DIFFERENCE IS THE WHOLE CLAIM. Producing an answer
   * unaided in January is not undone by picking it off a list in March; the learner has shown they
   * can produce it. Taking the latest would let a cheap recognition check silently DEMOTE a real
   * demonstration, which is the opposite of the failure §33 is guarding against but just as wrong.
   *
   * 🔴 NULL MEANS "NO DEMONSTRATION, OR NONE THAT RECORDED ITS RUNG" — never a rung of its own.
   * Rows written before the column existed carry no rung, so a caller asking `satisfies` about them
   * gets `false`: we cannot show they produced it unaided, and claiming they did is exactly the
   * inflation this field exists to stop.
   */
  demonstratedAt: ScaffoldRung | null;
  /** ISO of the most recent evidence, or null when there is none. */
  lastEvidenceAt: string | null;
  /** The most recent judged verdict, or null if none was ever obtained. Kept because `strong` and
   *  `understood` both project to `correct`, and a policy may reasonably treat them differently. */
  latestVerdict: EvidenceVerdict | null;
}

/**
 * May this observation's verdict change what Nemesis believes about the learner?
 *
 * 🔴 A JUDGE THAT REACHED BUT COULD NOT TELL IS MUCH CLOSER TO UNREACHABLE THAN TO A VERDICT. This
 * is evidence invariant 9 one step further in: an unreachable judge writes nothing at all, because
 * there is no account of the performance; here there IS an account — they answered, we saw it, we
 * timed it — and only the conclusion is missing. So the observation stays and the claim does not.
 * Measured: the same answer was read `partial 0.30` and `incorrect 0.90` six minutes apart, and both
 * readings passed straight through to different teaching.
 *
 * 🔴 SYMMETRIC ACROSS ALL VERDICTS. An uncertain "correct" is exactly as unreliable as an uncertain
 * "wrong"; gating only what would move a learner DOWN would mean believing the judge when it
 * flatters and doubting it when it does not, which is a thumb on the scale rather than a gate.
 *
 * 🔴 APPLIED HERE, AT READ TIME, AND THAT IS THE WHOLE REASON NO COLUMN WAS ADDED. §5: no threshold,
 * bucket or verdict about a signal may be computed at write time — store what was measured, decide
 * what it means where the decision can be changed. A `trusted` boolean on the row would bake today's
 * number into history, so every row written before someone retuned it would silently mean something
 * different and no migration could recover what was actually observed. The measurement is already
 * stored: `confidence`. Moving the threshold now reinterprets every row ever written, for free.
 *
 * 🔴 ABSENT CONFIDENCE IS NOT LOW CONFIDENCE. Admissions of not knowing carry none, and neither does
 * any row written before the judge reported one. Treating absence as failure would silently convert
 * every one of them — and every evaluation that merely omitted the field, which the parser turns
 * into 0.5 for exactly this reason — into a learner who demonstrated nothing.
 *
 * 🔴 EXPORTED SO `retention-model.ts` FOLDS THE SAME EVIDENCE THIS PROJECTION DOES. A retrievability
 * estimate built by folding EVERY row, including ones this projection would not stand behind, would
 * be a second, disagreeing reading of the same log: an untrusted `strong` could grant stability here
 * that `projectLearnerState` refused to grant a `correct` status for. Reusing this gate rather than
 * re-deriving it is what keeps the two readings unable to drift apart.
 */
export function establishesBelief(evidence: LearnerEvidence): boolean {
  return evidence.confidence === undefined || evidence.confidence >= TRUSTED_ENOUGH_TO_UPDATE_STATE;
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
      demonstratedAt: null,
      demonstrationCount: 0,
      evidenceCount: 0,
      lastEvidenceAt: null,
      latestVerdict: null,
      objectiveIdentityKey,
      status: "unknown",
    };
  }

  const latest = distinct[distinct.length - 1]!;

  // 🔴 THE LINE BETWEEN AN OBSERVATION AND A CONCLUSION, AND IT IS DRAWN ON PURPOSE. `evidenceCount`
  // and `lastEvidenceAt` describe what HAPPENED — an opportunity was given, at this time — and every
  // row counts toward them however the judge read it. A learner who answered and was read uncertainly
  // has still just been asked, and the policy's churn guard must know that or it will ask again
  // immediately. Everything below is a CONCLUSION drawn from a verdict, so it may only be drawn from
  // verdicts we are willing to stand behind.
  const believable = distinct.filter(establishesBelief);
  // 🔴 A RESPONSE THAT NEVER MENTIONED THIS OBJECTIVE IS NOT AN ATTEMPT AT IT, AND MUST NOT DECIDE
  // ITS STATUS. This is the fan-out's whole point arriving at the read: one answer writes a row for
  // every objective the question spanned, and the rows for the ones it said nothing about carry
  // `demonstrationObtained: false` — structurally identical to "asked, produced nothing usable".
  // Left in, the owner's own case goes wrong exactly as they described it: asked to explain phase 0,
  // "Sodium enters the cell, causing rapid depolarization" would record *why Na⁺ moves inward* as a
  // FAILED attempt, and the learner would be shown a correction for something they were never asked.
  //
  // 🔴 FILTERED FOR THE STATUS ONLY, NEVER FOR `evidenceCount` OR `lastEvidenceAt`. The row is real
  // and the opportunity genuinely passed — the churn guard has to see it, or the policy will re-ask
  // the same question immediately. What it may not do is claim something about the learner.
  const attempts = believable.filter((e) => e.objectiveEvidence !== "not_addressed");
  const latestBelievable = attempts[attempts.length - 1] ?? null;
  const demonstrations = believable.filter((e) => e.demonstrationObtained && e.verdict);
  const latestDemonstration = demonstrations[demonstrations.length - 1] ?? null;

  // 🔴 THE HIGHEST RUNG AT WHICH THE OBJECTIVE WAS ACTUALLY DEMONSTRATED — NOT MERELY ATTEMPTED.
  //
  // 🔴 `demonstrations` IS THE WRONG SET TO FOLD, AND USING IT WAS A REAL BUG. It filters on
  // `demonstrationObtained && verdict`, and `rowForTarget` sets `demonstrationObtained: outcome
  // !== null` — true whenever the judge SPOKE about this objective, including to say `incorrect` or
  // `misconception`. So an unaided WRONG answer folded in as `independent`, and `satisfies(state,
  // "independent")` then returned true for a learner who had only ever answered unaided and wrong.
  //
  // That bites precisely where the rung is supposed to protect: wrong at `independent`, then a
  // later sweep ✓ at `recognition`, and §31.2's provisional check sees production already on record
  // and advances as though they had produced it. The exact false ✓ the ladder exists to prevent,
  // arriving through the field built to prevent it.
  //
  // So the fold asks what the response ESTABLISHED. `strong` and `understood` are the two verdicts
  // `statusFor` maps to `correct`; `partial` deliberately does not count, because part of an
  // objective shown at a demand is not that objective shown at that demand.
  //
  // Rows with no rung contribute nothing rather than a default — see `demonstratedAt`.
  const demonstratedAt = demonstrations.reduce<ScaffoldRung | null>(
    (best, e) =>
      e.scaffoldRung && (e.verdict === "strong" || e.verdict === "understood")
        ? best
          ? higherRung(best, e.scaffoldRung)
          : e.scaffoldRung
        : best,
    null,
  );

  return {
    demonstratedAt,
    demonstrationCount: demonstrations.length,
    evidenceCount: distinct.length,
    lastEvidenceAt: latest.occurredAt,
    latestVerdict: latestDemonstration?.verdict ?? null,
    objectiveIdentityKey,
    // The most recent event decides the current status: someone who has just corrected a
    // misconception is not still holding it, and the history remains in the log either way. When
    // that event obtained nothing, the honest status is `not_demonstrated` — an opportunity passed
    // and we still do not know, which is different from having been shown a wrong answer.
    //
    // 🔴 THE MOST RECENT BELIEVABLE ONE, WHICH IS STILL A FUNCTION OF ONE VERDICT. This is NOT a
    // multi-signal status and must not become one: averaging would treat someone who has just
    // corrected a misconception as though they still held it, and recency is exactly what makes the
    // projection right. An unbelievable reading is skipped rather than blended — the learner's state
    // is left where their last real demonstration put it, which is the honest answer to "what do we
    // know?" when the answer is "no more than before they answered".
    //
    // 🔴 AND WHEN NOTHING BELIEVABLE EXISTS AT ALL, THE STATUS IS `unknown`, NOT `not_demonstrated`.
    // The difference decides the teaching: `not_demonstrated` states the answer, and stating an
    // answer to someone whose response we merely could not read teaches them something they may
    // already know. `unknown` asks — which is the only honest next move, and the one the state was
    // built to express.
    status: latestBelievable
      ? latestBelievable.demonstrationObtained && latestBelievable.verdict
        ? statusFor(latestBelievable.verdict)
        : "not_demonstrated"
      : "unknown",
  };
}

/**
 * Has this objective been demonstrated at a demand of at least `required`? — §31.1, executed.
 *
 * 🔴 THIS IS THE ONLY SANCTIONED WAY TO ASK "DO THEY KNOW IT", AND THE REQUIRED RUNG IS NOT
 * OPTIONAL. That is the enforcement: the ambiguous question is unaskable rather than merely
 * discouraged. A caller cannot write `if (state.demonstrated)` and get a recognition tap counted as
 * production, because there is no such field to read — they must say at what demand they mean, and
 * saying it makes the answer honest.
 *
 * 🔴 PRODUCTION IMPLIES RECOGNITION; RECOGNITION IMPLIES NOTHING ABOVE IT. `entails` holds the
 * direction, and it is a direction rather than a matter of degree — which is precisely why a single
 * confidence number could never have expressed it.
 *
 * 🔴 AND A DEMONSTRATION WITH NO RECORDED RUNG SATISFIES NOTHING. Every row written before §33
 * lands here, and crediting them with unaided production would be the inflation this exists to
 * stop. The error is deliberately in the under-claiming direction: the cost is re-asking something
 * the learner may already know, which is annoying and self-correcting, against silently skipping
 * something they never showed, which is invisible and compounds under scheduling.
 */
export function satisfies(state: LearnerObjectiveState, required: ScaffoldRung): boolean {
  return state.demonstratedAt !== null && entails(state.demonstratedAt, required);
}

/** Project every objective present in a log at once, for a canvas asking "what does this learner
 *  already hold?" across a whole source. Objectives with no evidence are simply absent — a caller
 *  that needs them must ask for them by key and receive `unknown`, rather than this function
 *  inventing rows for objectives it was never told about. */
export function projectAll(evidence: readonly LearnerEvidence[]): Map<string, LearnerObjectiveState> {
  const keys = [...new Set(evidence.map((e) => e.objectiveIdentityKey))];
  return new Map(keys.map((key) => [key, projectLearnerState(key, evidence)]));
}
