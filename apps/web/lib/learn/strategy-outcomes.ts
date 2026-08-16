// What the two teaching controllers actually produced, computed from the evidence log.
//
// 🔴 A PROJECTION, NOT A SECOND STORE, AND THAT IS THE WHOLE ARCHITECTURE OF THIS FILE. Every number
// below is derived from `learner_evidence` rows on every call. Nothing is accumulated, nothing is
// written, and there is no `experiment_results` table — because a stored metric is a decision about
// what a number MEANS, frozen at the moment it was computed, and rows recorded under the old
// definition become indistinguishable from rows recorded under the new one. The evidence log is the
// truth here for the same reason it is the truth for learner state: delete this file and rebuild it
// and you get the same answers.
//
// 🔴 SO THE DEFINITIONS BELOW ARE REWRITABLE, AND THEY WILL NEED REWRITING. "Mastery" is defined
// here as the first demonstration Nemesis was willing to stand behind, which is a defensible reading
// and not the only one. Anyone who disagrees can change the function and recompute the whole history
// — which is exactly the property that would be lost if these were columns.
//
// 🔴 ABSENT IS RETURNED AS `null`, NEVER AS `0`, AND THREE OF THE EIGHT REQUESTED OUTCOMES ARE
// STRUCTURALLY UNMEASURABLE TODAY. Reporting a zero for something nothing instruments is the same
// defect as writing `?? 0` into an evidence row: it turns "we did not observe this" into "we
// observed none of it", and the two are opposite. Each one says so in its own comment, and the
// comparison prints "not instrumented" rather than a tie.
//
// ── HOW THE COMPARISON IS ACTUALLY RUN TODAY, STATED PLAINLY ────────────────────────────────────
//
// 🔴 THESE FUNCTIONS TAKE ROWS IN MEMORY, AND THERE IS NO ENDPOINT THAT FEEDS THEM AT SCALE.
// `loadEvidence` needs a `StoredObjective[]` and caps at 1,000 rows, so it answers "this learner, on
// this canvas's objectives" and not "every row in the experiment". Saying "the outcomes are
// queryable" without saying that would be the overclaim this file exists to avoid — so: the
// grouping is done in SQL, and these functions are what turns one learner's rows into the summary.
//
// The sweep that establishes the arms are separable at all, verified against production:
//
//     select coalesce(teaching_strategy, '(none)') as arm,
//            count(*)                                              as rows,
//            count(distinct response_id)                           as interactions,
//            count(*) filter (where objective_evidence = 'demonstrated') as demonstrated
//     from public.learner_evidence
//     group by 1 order by 2 desc;
//
// 🔴 IT RETURNS ONE ROW, `(none)`, AND THAT IS THE CORRECT ANSWER RATHER THAN A BROKEN ONE. No
// session has run under an arm yet, because randomisation is off and nobody has typed the override.
// "No rows carry an arm" and "the grouping does not work" look identical from a distance, which is
// exactly why the query was run before anyone claimed the second.
//
// ── WHAT THE OWNER ACTUALLY ASKED TO MAXIMISE ───────────────────────────────────────────────────
//
// *"Maximise durable understanding of important material per unit of active attention."* Not speed,
// not immediate correctness. Every measurement added below exists to make one clause of that
// sentence countable, and each one is `null` rather than `0` wherever it is not yet instrumented:
//
//   durable      → a demonstration produced across a real gap, not minutes after being told.
//   understanding→ objectives DEMONSTRATED, never objectives shown, opened, or acknowledged.
//   important    → weighted by an importance reading passed IN, and unweighted, LOUDLY, without one.
//   per unit of  → a ratio whose denominator is stated, not implied.
//   active       → time with a prompt on screen awaiting an answer, never wall clock.
//
// 🔴🔴 AND THE INSTRUMENT IS NOT THE RESULT. Production holds FIVE `learner_evidence` rows in total.
// Nothing below is a finding, none of it may be quoted as one, and the reason each function reports
// its own raw counts beside every rate is so that the day there is enough data, the reader can see
// the population a number was computed over rather than trusting the number.

import { performanceKey, type LearnerEvidence } from "./learner-evidence";
import type { ObjectiveEvidence } from "./scaffold-rung";
import { TEACHING_STRATEGIES, type TeachingStrategyId } from "./teaching-strategy";

/**
 * A demonstration Nemesis is willing to call mastery of this objective — the first one.
 *
 * 🔴 `objectiveEvidence === "demonstrated"` RATHER THAN `verdict` IS DELIBERATE AND THEY ARE NOT THE
 * SAME QUESTION. The verdict is what the judge said about the ANSWER; `objectiveEvidence` is what
 * that answer established about THIS objective, which for a multi-target answer is the only one of
 * the two that is per-objective at all. Using the verdict would credit every objective an answer
 * touched with whatever the answer as a whole scored, which is precisely the spreading that
 * `objective-task.ts` refuses at the write boundary. Undoing it at the read boundary would be no
 * better for being downstream.
 */
function isMastery(row: LearnerEvidence): boolean {
  return row.objectiveEvidence === "demonstrated";
}

/** The answer contradicted the objective — wrong, or a specific competing belief. */
function isError(row: LearnerEvidence): boolean {
  return row.objectiveEvidence === "contradicted";
}

/** An opportunity was given and the learner produced nothing: a reveal, a give-up, an "I don't know". */
function isNothingProduced(row: LearnerEvidence): boolean {
  return row.objectiveEvidence === "nothing_produced";
}

/**
 * The `ObjectiveEvidence` values that mean the learner MET this objective's opportunity.
 *
 * 🔴 `not_addressed` IS NOT AN ATTEMPT, AND MAKING THAT A TYPE RATHER THAN A CONVENTION IS THE POINT.
 * The fan-out is total over a prompt's targets, so an answer covering one of four objectives writes
 * three `not_addressed` rows — the answer said nothing about them. Counting those as attempts would
 * report a broad prompt as three-quarters failure, and no learner ever failed at them.
 */
export type AttemptEvidence = Exclude<ObjectiveEvidence, "not_addressed">;

/** The learner met this opportunity and something came back — including "nothing usable". */
function attemptEvidenceOf(row: LearnerEvidence): AttemptEvidence | null {
  const evidence = row.objectiveEvidence;
  if (!evidence || evidence === "not_addressed") return null;
  return evidence;
}

/**
 * The learner met the opportunity and did not establish the objective.
 *
 * 🔴 `partial` IS DELIBERATELY NOT A MISS, AND IT IS DELIBERATELY NOT A DEMONSTRATION EITHER.
 * Runtime does not decide what partial understanding means — that is Brain's call, and a projection
 * that quietly sorted `partial` into one bucket or the other would be making it by default and
 * making it invisibly. Everywhere below, the question asked is the one this file CAN answer without
 * ranking it: was there a demonstration, or was there not.
 */
function isMiss(row: LearnerEvidence): boolean {
  return isError(row) || isNothingProduced(row);
}

function ascending(rows: readonly LearnerEvidence[]): LearnerEvidence[] {
  // Ends on the row id so two rows sharing a timestamp order stably rather than by whatever the
  // caller's read happened to produce — the same rule the paged database read follows.
  return [...rows].sort((a, b) =>
    a.occurredAt === b.occurredAt ? a.id.localeCompare(b.id) : a.occurredAt.localeCompare(b.occurredAt),
  );
}

function byObjective(rows: readonly LearnerEvidence[]): Map<string, LearnerEvidence[]> {
  const grouped = new Map<string, LearnerEvidence[]>();
  for (const row of rows) {
    const existing = grouped.get(row.objectiveIdentityKey);
    if (existing) existing.push(row);
    else grouped.set(row.objectiveIdentityKey, [row]);
  }
  return grouped;
}

/**
 * How long after a delay a demonstration still counts as retention rather than as the same sitting.
 *
 * 🔴 A THRESHOLD IN A PROJECTION, WHICH IS THE ONLY PLACE ONE IS ALLOWED TO LIVE. Nothing writes
 * this into a row — an interpretation stored is an interpretation that cannot be revised, and rows
 * recorded under one delay mean something different from rows recorded under another. Here it is an
 * argument to a function, so changing it recomputes the entire history under the new reading.
 *
 * Twelve hours is chosen to be longer than any plausible single sitting and shorter than a day, so
 * "they came back the next morning" counts and "they answered again after a coffee" does not.
 */
export const RETENTION_DELAY_MS = 12 * 60 * 60 * 1000;

const HOUR_MS = 60 * 60 * 1000;

/**
 * How much active attention one arm's rows account for, in milliseconds.
 *
 * ── WHICH OF THE TWO TIME SIGNALS IS AUTHORITATIVE, AND WHY ─────────────────────────────────────
 *
 * 🔴🔴 `responseLatencyMs` IS AUTHORITATIVE. `canvas-events.ts` also tracks `activeElapsedMs`, which
 * is a WIDER measure — it covers reading and thinking, not just answering — and it is still the
 * wrong one, for a reason that has nothing to do with what it measures:
 *
 *   1. IT LIVES IN A RING BUFFER THAT DROPS THE OLDEST ROWS. `MAX_EVENTS` is 500 and `appendEvent`
 *      slices; that file's own header says it is "not a history anything may be reconstructed from".
 *      A denominator built on it SHRINKS AS A SESSION GETS LONGER — so a per-minute rate would climb
 *      the harder someone worked, which is the exact opposite of the truth and would be invisible.
 *   2. IT IS NOT IN THE EVIDENCE LOG. This file is a projection over `learner_evidence` and nothing
 *      else; sourcing half a ratio from a jsonb document on the canvas row would mean the numbers
 *      could no longer be rebuilt by deleting this file and running it again.
 *   3. IT IS A PER-CANVAS CUMULATIVE SNAPSHOT. It cannot be attributed to an arm, an objective or a
 *      performance without an assumption about which interval belonged to which — and an arm
 *      comparison whose denominator was apportioned by assumption is not a comparison.
 *
 * 🔴 AND THE HONEST LIMITATION, STATED RATHER THAN HIDDEN — THE SAME WAY `medianTimeToMasteryMs`
 * STATES ITS OWN. `responseLatencyMs` runs from the prompt appearing to the answer being submitted,
 * so it is a LOWER BOUND on active attention: the minutes spent reading an exposition before the
 * question appeared are real attention and are not in here. This measures the cost of ANSWERING. It
 * is comparable BETWEEN arms for the reason wall clock is — nothing about which controller is
 * running changes what the number leaves out — and it must not be quoted as total study time.
 *
 * 🔴🔴 SUMMED PER PERFORMANCE, NEVER PER ROW, AND THIS IS THE DEFECT MOST LIKELY TO BE INTRODUCED
 * HERE. `objective-task.ts` writes THE WHOLE MEASURED DURATION ON EVERY ROW a submission produces —
 * one twenty-second answer covering four objectives is four rows each reading 20,000. Summing rows
 * would report eighty seconds of attention for twenty seconds of work, and would do it in exact
 * proportion to how broad the arm's questions were: the arm asking richer questions would look four
 * times more expensive for being better. So the first latency seen per `performanceKey` is taken and
 * the rest are dropped — not averaged, not divided, not added.
 */
function activeAttentionOf(rows: readonly LearnerEvidence[]): {
  activeAttentionMs: number | null;
  performancesWithLatency: number;
} {
  const perPerformance = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.responseLatencyMs !== "number") continue;
    const key = performanceKey(row);
    // First wins. They are identical by construction; if two ever disagreed, taking one is right
    // and adding them is not.
    if (!perPerformance.has(key)) perPerformance.set(key, row.responseLatencyMs);
  }
  if (perPerformance.size === 0) {
    // 🔴 NOT ZERO. Legacy rows carry no latency at all, and "nobody spent any time" is a claim
    // nothing here observed. A zero denominator would make every rate below either infinite or
    // silently dropped.
    return { activeAttentionMs: null, performancesWithLatency: 0 };
  }
  let total = 0;
  for (const ms of perPerformance.values()) total += ms;
  return { activeAttentionMs: total, performancesWithLatency: perPerformance.size };
}

/**
 * One piece of the source's material, and how important the source made it.
 *
 * 🔴 THE IMPORTANCE READING IS AN ARGUMENT, NOT AN IMPORT, AND THAT IS DELIBERATE. The signal itself
 * is being built separately as `source-importance.ts`; taking it as a parameter means this function
 * composes with it the day it lands, needs no edit to do so, and — more to the point — can be
 * calibrated today against a reading that does not exist yet.
 *
 * 🔴 `importance` ABSENT MEANS NO READING FOR THIS UNIT, NOT "UNIMPORTANT". Defaulting it to 0 would
 * silently delete the unit from a weighted total; defaulting it to 1 would silently invent a reading
 * the extractor never made. It stays absent, and its absence is REPORTED — see `weighted`.
 */
export interface CoverageUnit {
  /** The objective identity, as it appears on an evidence row. */
  identityKey: string;
  /** How important the source made this. Absent means no reading. Negative weights are ignored. */
  importance?: number;
}

/**
 * How much of the source's material this arm's attention actually reached.
 *
 * 🔴 THE DENOMINATOR IS THE SOURCE, WHICH IS WHY IT CANNOT COME FROM THE ROWS. Every other outcome
 * here is computed from evidence alone, and coverage cannot be: material nobody was ever asked about
 * leaves no row, so a projection over rows can only ever report 100%. The units are supplied, they
 * are the same for both arms, and that shared denominator is exactly what makes coverage an arm
 * outcome at all — an arm that drills one objective all afternoon reaches less of the source than
 * one that spreads, and only a denominator neither arm controls can show it.
 *
 * 🔴 NOT `knowledge-coverage.ts`'s `coverageOfSource`, AND THE NAMES ARE KEPT APART ON PURPOSE. That
 * one asks whether the EXTRACTOR represented the document; this one asks whether the LEARNER'S
 * ATTENTION reached the material. A source can be perfectly extracted and almost entirely unstudied,
 * and reading either number as the other would report one as the other's answer.
 */
export interface AttentionCoverage {
  /**
   * Whether the fractions below are importance-weighted.
   *
   * 🔴🔴 `true` ONLY WHEN EVERY UNIT CARRIES A READING, AND THE PARTIAL CASE IS THE WHOLE REASON THIS
   * FIELD EXISTS. When `source-importance.ts` lands, the realistic state is that SOME units carry an
   * importance and some do not. Weighting the ones that do and quietly ignoring the rest produces a
   * number that looks weighted, is labelled weighted, and was computed over a subset nobody chose —
   * the "silently pretend it is weighted" failure this instrument was told to avoid. So: all or
   * nothing, and `unitsWithImportance` beside `unitsTotal` shows the reader the shortfall.
   */
  weighted: boolean;
  unitsTotal: number;
  unitsWithImportance: number;
  /**
   * Units the runtime put in front of the learner at all.
   *
   * 🔴 ANY EVIDENCE ROW COUNTS, INCLUDING `not_addressed`. A row exists only for an objective that
   * was a target of a prompt, so even "the answer said nothing about this" is proof the material was
   * staged. This is a measure of where attention was SPENT, not of what was learned — which is why
   * `unitsDemonstrated` sits next to it and neither is reported without the other.
   */
  unitsReached: number;
  /** Units that reached a demonstration. The half of coverage that is about understanding. */
  unitsDemonstrated: number;
  /** Unweighted fractions — always computable, and reported even when `weighted` is true. */
  reachedFraction: number | null;
  demonstratedFraction: number | null;
  /** Importance-weighted fractions. 🔴 `null` unless `weighted`, never a silent fallback. */
  weightedReachedFraction: number | null;
  weightedDemonstratedFraction: number | null;
}

/**
 * Coverage of a supplied set of units by one arm's rows.
 *
 * 🔴 EXPORTED SEPARATELY BECAUSE IT ANSWERS A DIFFERENT QUESTION FROM THE REST OF THE SUMMARY, and
 * a caller holding units but no arm split has a legitimate use for it on its own.
 */
export function attentionCoverageOf(
  units: readonly CoverageUnit[],
  rows: readonly LearnerEvidence[],
): AttentionCoverage {
  const touched = new Set<string>();
  const demonstrated = new Set<string>();
  for (const row of rows) {
    touched.add(row.objectiveIdentityKey);
    if (isMastery(row)) demonstrated.add(row.objectiveIdentityKey);
  }

  // 🔴 DEDUPED ON IDENTITY. A unit listed twice would count twice in the denominator and once in the
  // numerator, and coverage would fall the more thoroughly the source was read.
  const byKey = new Map<string, CoverageUnit>();
  for (const unit of units) if (!byKey.has(unit.identityKey)) byKey.set(unit.identityKey, unit);
  const deduped = [...byKey.values()];

  const withImportance = deduped.filter(
    (unit) => typeof unit.importance === "number" && unit.importance >= 0,
  );
  const weighted = deduped.length > 0 && withImportance.length === deduped.length;

  let reached = 0;
  let mastered = 0;
  let importanceTotal = 0;
  let importanceReached = 0;
  let importanceDemonstrated = 0;
  for (const unit of deduped) {
    const weight = weighted ? (unit.importance as number) : 0;
    importanceTotal += weight;
    if (touched.has(unit.identityKey)) {
      reached += 1;
      importanceReached += weight;
    }
    if (demonstrated.has(unit.identityKey)) {
      mastered += 1;
      importanceDemonstrated += weight;
    }
  }

  // 🔴 AN EMPTY SOURCE IS `null`, NOT 0% AND NOT 100%. Both readings are defensible for a denominator
  // of zero, which is exactly why neither may be asserted.
  const fraction = (part: number): number | null => (deduped.length === 0 ? null : part / deduped.length);
  const weightedFraction = (part: number): number | null =>
    weighted && importanceTotal > 0 ? part / importanceTotal : null;

  return {
    demonstratedFraction: fraction(mastered),
    reachedFraction: fraction(reached),
    unitsDemonstrated: mastered,
    unitsReached: reached,
    unitsTotal: deduped.length,
    unitsWithImportance: withImportance.length,
    weighted,
    weightedDemonstratedFraction: weightedFraction(importanceDemonstrated),
    weightedReachedFraction: weightedFraction(importanceReached),
  };
}

/**
 * What happened to objectives that DEPEND on one the learner never got.
 *
 * 🔴🔴 THE ONLY MEASUREMENT HERE THAT CAN TELL A GOOD "MOVE ON" FROM A BAD ONE. Every other outcome
 * scores what the learner produced; this one scores what the CONTROLLER chose. Moving on from a weak
 * objective is sometimes exactly right — drilling a stuck learner is the trap the policy audit is
 * about — and sometimes it strands everything built on top of it. Nothing else distinguishes them.
 *
 * 🔴 THE DEFERRAL ITSELF IS NOT IN THE LOG, SO IT IS NOT WHAT IS MEASURED. `decideNext` holds
 * "moved on" in session state (`actedOn`), which is deliberately not learner state and is never
 * written. What IS observable is the CONSEQUENCE: an attempt on a dependent objective made while its
 * prerequisite stood unresolved. That is the thing worth knowing anyway — a deferral nothing was
 * built on costs nothing.
 */
export interface DeferredPrerequisiteOutcome {
  /** Attempts on a dependent made while a prerequisite was attempted and not yet demonstrated. */
  attemptsOverUnresolved: number;
  demonstrationsOverUnresolved: number;
  /** Attempts made while every prerequisite that had evidence had been demonstrated. */
  attemptsOverResolved: number;
  demonstrationsOverResolved: number;
  /**
   * Attempts excluded because no prerequisite had ANY evidence yet.
   *
   * 🔴🔴 A THIRD BUCKET, AND FOLDING IT INTO "UNRESOLVED" WOULD WRECK THE METRIC. A prerequisite
   * never attempted was never MOVED ON FROM — it was never reached. Ordinary teaching order produces
   * this constantly, and on a real corpus it would dominate both rates and report normal sequencing
   * as deferral harm. Counted, excluded, and reported so the exclusion is visible.
   */
  attemptsOverUnreached: number;
  /**
   * Attempts excluded because the dependent shared ONE PERFORMANCE with its prerequisite.
   *
   * 🔴 ONE ANSWER COVERING BOTH IS NOT AN ATTEMPT MADE AFTER DEFERRING. It is one broad prompt, and
   * counting it would turn prompt breadth into deferral harm — the same row-versus-performance error
   * this file already refuses one layer in.
   */
  attemptsSharingPerformance: number;
  /** 🔴 `null` when that population is empty. The CONTRAST between the two is the finding; neither
   *  number means anything alone, and a 0 from an empty bucket would look like total failure. */
  demonstrationRateOverUnresolved: number | null;
  demonstrationRateOverResolved: number | null;
}

/**
 * Whether the attempt after a miss did better than the miss.
 *
 * 🔴🔴 NAMED FOR WHAT IT MEASURES, WHICH IS NOT "DID THE CORRECTION WORK". Showing a correction
 * produces NO evidence row — `policy-runtime.ts` is explicit that reading one is not a claim anyone
 * can now do anything, and it must never become evidence. So the log cannot separate a miss that was
 * followed by a correction from one that was not, and a field called `remediationWorked` would be
 * asserting a cause this data cannot see. What is observable is the next attempt on the same
 * objective, whatever happened in between.
 */
export interface RecoveryAfterMiss {
  /** Misses that had a later attempt on the same objective — the only ones that could recover. */
  missesWithLaterAttempt: number;
  /** ... whose next attempt was a demonstration. */
  recovered: number;
  recoveryRate: number | null;
  /**
   * What the next attempt actually was, in full.
   *
   * 🔴 PUBLISHED SO NOBODY HAS TO TRUST THE RATE'S NUMERATOR. A reader who believes `partial` after
   * `contradicted` is recovery can compute that reading from these counts — without this file having
   * ranked `partial`, which is not its call to make.
   */
  nextAttemptEvidence: Readonly<Record<AttemptEvidence, number>>;
}

/**
 * Inputs a summary needs that are not on the evidence rows.
 *
 * 🔴 OPTIONAL, EVERY FIELD, AND ABSENCE READS `null` RATHER THAN ZERO. A caller with no prerequisite
 * map is not reporting "deferring never hurt" — it is reporting that nothing asked. Making these
 * required would force every existing caller to fabricate an input, and a fabricated input is how a
 * measurement starts describing its own defaults.
 */
export interface OutcomeContext {
  /** Objective identity → the identities it depends on. Straight from `prerequisiteMap`. */
  prerequisites?: ReadonlyMap<string, readonly string[]>;
  /** The source's material, for coverage. The same list for both arms or the comparison is void. */
  coverage?: readonly CoverageUnit[];
  /**
   * Every row for this learner, BOTH ARMS.
   *
   * 🔴 WHETHER A PREREQUISITE IS RESOLVED IS A FACT ABOUT THE LEARNER, NOT ABOUT ONE ARM. If arm A
   * taught the prerequisite and arm B then asked the dependent, arm B did not ask over an unresolved
   * prerequisite — but arm B's rows alone cannot show that, and reading them alone would file the
   * prerequisite as never-reached. `compareStrategies` supplies the full log automatically. A direct
   * caller that omits it gets the arm's own rows and the narrower reading.
   */
  history?: readonly LearnerEvidence[];
}

/**
 * The outcomes one arm produced.
 *
 * 🔴 EVERY FIELD THAT CAN BE ABSENT IS `| null`, AND THE READER MUST NOT COALESCE IT. A `null`
 * `medianTimeToMasteryMs` means no objective under this arm ever reached a demonstration — which is
 * a finding, and a very different one from "it took no time".
 */
export interface StrategyOutcomeSummary {
  strategy: TeachingStrategyId;
  /** Objectives this arm produced any evidence about at all. The denominator for everything else. */
  objectivesTouched: number;
  /**
   * How many learner actions this arm cost.
   *
   * 🔴 PERFORMANCES, NOT ROWS. One answer covering four objectives is four rows and ONE interaction,
   * and counting rows would report an arm that asks broad questions as four times busier than one
   * asking narrow ones — an artefact of the knowledge shape, not of the teaching. `performanceKey`
   * already exists for exactly this and is reused rather than re-derived.
   */
  interactions: number;
  /** Objectives that reached a demonstration Nemesis stands behind. */
  objectivesMastered: number;
  /**
   * Median wall-clock from an objective's first evidence under this arm to its first mastery.
   *
   * 🔴 MEDIAN, NOT MEAN, AND THAT IS A CORRECTION OF A MISTAKE THIS REPO HAS ALREADY MADE. A mean
   * over a bimodal population reads as a moderate middle that describes nobody — a previous audit
   * here reported "CF -0.51" over a split of 222 better and 92 worse. Report the distribution.
   *
   * 🔴 WALL CLOCK, WHICH INCLUDES TIME THE LEARNER SPENT AWAY. That is a real limitation and it is
   * stated rather than hidden: an objective first met on Monday and mastered on Friday reads as four
   * days. It is comparable BETWEEN arms, because nothing about which controller is running changes
   * how often someone closes the tab, and it is not a measure of effort.
   */
  medianTimeToMasteryMs: number | null;
  /** Every time-to-mastery observed, ascending — so a reader can see the shape rather than a middle. */
  timeToMasteryMs: readonly number[];
  /**
   * How many times an objective was got wrong AGAIN after already having been got wrong.
   *
   * 🔴 REPEATS, NOT ERRORS. A first wrong answer is information — it is the system finding out what
   * the learner does not know, which is what it is for. The second and later ones on the same
   * objective are the interesting number, because they mean the teaching that followed the first did
   * not land.
   */
  repeatedErrors: number;
  /** Opportunities the learner met and produced nothing for: revealed, gave up, said they did not know. */
  nothingProduced: number;
  /**
   * Retrievals asked about an objective the learner had ALREADY demonstrated, within the retention
   * delay — attention spent on established material.
   *
   * 🔴 THE OUTCOME THIS EXPERIMENT IS MOST LIKELY TO SEPARATE THE ARMS ON, AND THE STRUCTURED ARM IS
   * NOT GIVEN A FREE PASS. `decideNext` holds a demonstrated objective behind `eligibleForRetrieval`;
   * the baseline has no such rule and must decide for itself not to ask. That asymmetry is not a
   * thumb on the scale — it IS the hypothesis, and the baseline was explicitly told not to spend
   * attention on what has been demonstrated. If it obeys, the structured spacing is buying less than
   * it costs.
   */
  askedAgainTooSoon: number;
  /**
   * Demonstrations produced within the same sitting as the previous act on that objective, over the
   * opportunities that came round that quickly — "immediate post-test performance".
   *
   * 🔴 THE EASY HALF OF THE PAIR, AND IT MUST BE READ BESIDE `delayedRetentionRate` RATHER THAN ON
   * ITS OWN. Answering correctly minutes after being taught something is the cheapest result in
   * education and the one every teaching method scores well on: it measures whether the answer is
   * still in working memory, which §39 is explicit is not a demonstration of durable knowledge. An
   * arm that wins here and loses on delayed retention has taught worse, not better. It is reported
   * because the owner asked for it and because the CONTRAST between the two numbers is the finding;
   * it is not reported as a headline.
   *
   * 🔴 SAME DENOMINATOR SPLIT AS THE DELAYED RATE, DELIBERATELY. Every opportunity with a preceding
   * act falls into exactly one of the two buckets, so the two rates are computed over disjoint,
   * exhaustive halves of the same population and can be compared without anyone re-deriving what
   * either was measured over.
   */
  immediatePostTestRate: number | null;
  /**
   * A demonstration produced at least `RETENTION_DELAY_MS` after the previous evidence on that
   * objective, over the demonstrations that HAD such a gap available.
   *
   * 🔴 `null` UNTIL A SESSION GAP EXISTS, AND THAT IS THE HONEST ANSWER RATHER THAN A ZERO. A pilot
   * run inside one afternoon produces no delayed retrievals at all, so the denominator is zero and
   * the rate is undefined — not 0%. Reporting 0% would say both arms failed at retention when
   * neither was measured on it.
   */
  delayedRetentionRate: number | null;
  /**
   * Demonstrations at an operation this learner had never demonstrated for that objective before.
   *
   * 🔴🔴 THIS IS LIVE NOW, AND THE COMMENT THAT USED TO SIT HERE SAYING OTHERWISE WAS STALE. It read
   * "structurally unmeasurable today … `objectivesForKnowledge` mints `recall` and essentially
   * nothing else". That has not been true since the wide-grid and procedure lanes shipped:
   * `runtime-support.ts` now stages FOUR pairs end to end — `association|recall`, `causal|predict`,
   * `classification|discriminate`, `procedure|sequence` — and production rows already carry two
   * distinct operations (`recall` and `predict`). Transfer became measurable and the comment went on
   * claiming it could not be. A stale disclaimer is worse than no disclaimer: it tells a reader not
   * to look at a number that had started working.
   *
   * 🔴 SO `null` NOW MEANS SOMETHING NARROWER — AND STILL MEANS "NOT MEASURED", NEVER "NO TRANSFER".
   * It is returned when THIS COHORT'S rows carry fewer than two distinct operations, which is a fact
   * about the sample in hand, not about the product. A cohort of one `recall` session cannot show
   * transfer whatever the runtime is capable of staging.
   */
  transferDemonstrations: number | null;

  // ── DURABLE UNDERSTANDING PER UNIT OF ACTIVE ATTENTION ──────────────────────────────────────────

  /**
   * Milliseconds of active attention this arm's answers cost.
   *
   * 🔴 THE DENOMINATOR THE OWNER'S OBJECTIVE NEEDS AND THIS FILE DID NOT HAVE. See
   * `activeAttentionOf` for why `responseLatencyMs` is authoritative over `canvas-events`'
   * `activeElapsedMs`, why it is summed per PERFORMANCE and never per row, and why it is a lower
   * bound on real study time rather than a measure of it.
   *
   * 🔴 `null` MEANS NO PERFORMANCE CARRIED A LATENCY — legacy rows have none. Never 0.
   */
  activeAttentionMs: number | null;
  /**
   * How many performances carried a latency at all.
   *
   * 🔴 THE POPULATION CHECK, AND IT IS HERE SO A RATE CANNOT BE READ WITHOUT IT. `interactions` is
   * the total; if this is smaller, the denominator of every per-attention rate below was measured
   * over a subset of the numerator's population, and the rate reads high by exactly that shortfall.
   * "A rate whose denominator is the wrong set" is the defect this file's test header names, and the
   * only defence against it is showing the reader both counts.
   */
  performancesWithLatency: number;
  /**
   * Demonstrations produced across a real gap — the numerator of durable learning.
   *
   * The same events `delayedRetentionRate` divides; exposed as a raw count so the rate is
   * recomputable and so a reader can see whether it rests on three observations or three hundred.
   */
  durableDemonstrations: number;
  /** Opportunities that HAD a real gap available. `delayedRetentionRate`'s denominator, exposed. */
  durableOpportunities: number;
  /**
   * Distinct objectives with at least one durable demonstration.
   *
   * 🔴 THE HEADLINE'S NUMERATOR, AND THE CHOICE IS STATED RATHER THAN LEFT IMPLICIT. An objective
   * demonstrated durably three times counts ONCE here and three times in `durableDemonstrations`.
   * The owner's sentence is "durable understanding of important MATERIAL" — the unit is a piece of
   * material held, not a repetition of holding it, and counting repetitions would reward an arm that
   * drills one item over one that teaches ten. Both counts are published, so the other reading is
   * one division away for anyone who disagrees.
   */
  objectivesDurablyDemonstrated: number;
  /**
   * 🔴 THE HEADLINE. Distinct objectives durably demonstrated, per hour of active attention.
   *
   * "Maximise durable understanding of important material per unit of active attention", reduced to
   * one number — and it is the number most likely to be quoted without its caveats, so they are
   * here rather than elsewhere:
   *
   * 🔴 `null` FOR TWO DIFFERENT REASONS, AND THEY ARE NOT INTERCHANGEABLE. Either no performance
   * carried a latency (`activeAttentionMs` is null — no denominator), or no opportunity ever had a
   * twelve-hour gap available (`durableOpportunities` is 0 — retention was never instrumented, so a
   * numerator of 0 measures nothing). BOTH read `null`, and the two sibling counts say which.
   *
   * 🔴 A 0 HERE WOULD BE A REAL FINDING AND MUST NOT BE MANUFACTURED. It means gaps existed, answers
   * were given across them, and nothing survived. That is exactly the result this instrument is for,
   * and it is the reason "not instrumented" may never be allowed to look like it.
   *
   * 🔴🔴 THE DENOMINATOR IS *ALL* OF THIS ARM'S ANSWERING TIME, NOT THE SUBSET THAT HAD A GAP
   * AVAILABLE, AND THAT ASYMMETRY IS DELIBERATE BUT MUST BE READ. Numerator and denominator are drawn
   * over different populations: every performance contributes attention, while only objectives
   * revisited after twelve hours can contribute a durable demonstration. On a real corpus, where most
   * objectives are answered once and never returned to, the denominator will be dominated by
   * attention that had no opportunity to reach the numerator at all — so the absolute number reads
   * LOW by that ratio, systematically. `performancesWithLatency` cannot show this: it discloses
   * attention that went unmeasured, not attention that was measured and could never have counted.
   *
   * It is kept this way because "attention spent per thing durably held" is the question the owner
   * asked, and restricting the denominator to revisited objectives would answer a narrower one —
   * "attention spent on the things we happened to come back to" — which flatters an arm that revisits
   * little. The bias falls identically on both arms, so the COMPARISON is sound; the absolute figure
   * is a floor, and must never be quoted as "this is how fast a learner learns".
   */
  durableDemonstrationsPerActiveHour: number | null;
  /**
   * How much of the source's material this arm's attention reached.
   *
   * 🔴 `null` WHEN NO UNITS WERE SUPPLIED — the caller did not ask, which is not the same as the arm
   * covering nothing. See `AttentionCoverage.weighted` for what happens when the importance reading is
   * partial or absent: it degrades to unweighted and SAYS SO.
   */
  coverage: AttentionCoverage | null;
  /**
   * Whether attempts made over an unresolved prerequisite went worse than attempts made over a
   * resolved one — the only measurement that can score a "move on".
   *
   * 🔴 `null` WHEN NO PREREQUISITE MAP WAS SUPPLIED. Not "deferring never hurt": nothing asked.
   */
  deferredPrerequisites: DeferredPrerequisiteOutcome | null;
  /** Whether the attempt following a miss did better. Computable from rows alone, so never `null` —
   *  though its own `recoveryRate` is `null` when no miss ever had a later attempt. */
  recoveryAfterMiss: RecoveryAfterMiss;
  /**
   * How much assistance the runtime offered, averaged over opportunities.
   *
   * 🔴🔴 ALSO UNMEASURABLE TODAY, AND FOR A REASON WORTH STATING PRECISELY. `UNSUPPORTED_RETRIEVAL`
   * is 0 and `promptTargeting` defaults the rung to `independent`, so this runtime has only ever
   * staged one kind of task: every row from both arms reads `scaffoldingLevel: 0`,
   * `scaffoldRung: independent`. The number would therefore be 0 for both arms and IDENTICAL BY
   * CONSTRUCTION — which a reader would very reasonably mistake for "the two arms scaffold the same
   * amount". They do not scaffold at all. `null` whenever every observation is the floor.
   */
  meanScaffoldingLevel: number | null;
}

/**
 * Did attempts made over an unresolved prerequisite go worse than attempts made over a resolved one?
 *
 * 🔴 "RESOLVED" MEANS "HAS A DEMONSTRATION BY THEN", AND THAT IS A STATEMENT ABOUT THE ABSENCE OF A
 * DEMONSTRATION RATHER THAN A READING OF ANYTHING ELSE. A prerequisite sitting at `partial` counts
 * as unresolved because it has no demonstration — not because this file decided partial is failure.
 */
function deferredPrerequisiteOutcome(
  rows: readonly LearnerEvidence[],
  prerequisites: ReadonlyMap<string, readonly string[]>,
  history: readonly LearnerEvidence[],
): DeferredPrerequisiteOutcome {
  const firstAttemptAt = new Map<string, number>();
  const firstDemonstrationAt = new Map<string, number>();
  const performancesOf = new Map<string, Set<string>>();
  for (const row of history) {
    const key = row.objectiveIdentityKey;
    const performances = performancesOf.get(key);
    if (performances) performances.add(performanceKey(row));
    else performancesOf.set(key, new Set([performanceKey(row)]));

    if (!attemptEvidenceOf(row)) continue;
    const at = Date.parse(row.occurredAt);
    const attempted = firstAttemptAt.get(key);
    if (attempted === undefined || at < attempted) firstAttemptAt.set(key, at);
    if (isMastery(row)) {
      const demonstrated = firstDemonstrationAt.get(key);
      if (demonstrated === undefined || at < demonstrated) firstDemonstrationAt.set(key, at);
    }
  }

  let attemptsOverUnresolved = 0;
  let demonstrationsOverUnresolved = 0;
  let attemptsOverResolved = 0;
  let demonstrationsOverResolved = 0;
  let attemptsOverUnreached = 0;
  let attemptsSharingPerformance = 0;

  for (const row of rows) {
    if (!attemptEvidenceOf(row)) continue;
    const needed = prerequisites.get(row.objectiveIdentityKey);
    // Nothing depends on anything here — this objective is not a dependent, so it is out of scope
    // rather than a zero.
    if (!needed || needed.length === 0) continue;

    const at = Date.parse(row.occurredAt);
    const performance = performanceKey(row);
    if (needed.some((prerequisite) => performancesOf.get(prerequisite)?.has(performance))) {
      attemptsSharingPerformance += 1;
      continue;
    }

    let anyUnresolved = false;
    let anyResolved = false;
    for (const prerequisite of needed) {
      const attempted = firstAttemptAt.get(prerequisite);
      // 🔴 NEVER ATTEMPTED BY NOW IS NEITHER BUCKET. It was not moved on from; it was not reached.
      if (attempted === undefined || attempted > at) continue;
      const demonstrated = firstDemonstrationAt.get(prerequisite);
      if (demonstrated !== undefined && demonstrated <= at) anyResolved = true;
      else anyUnresolved = true;
    }

    if (!anyUnresolved && !anyResolved) {
      attemptsOverUnreached += 1;
      continue;
    }
    // 🔴 ONE UNRESOLVED PREREQUISITE IS ENOUGH. A dependent standing on two things, one of which the
    // learner never got, was attempted over a hole — that the other leg was solid does not fill it.
    if (anyUnresolved) {
      attemptsOverUnresolved += 1;
      if (isMastery(row)) demonstrationsOverUnresolved += 1;
    } else {
      attemptsOverResolved += 1;
      if (isMastery(row)) demonstrationsOverResolved += 1;
    }
  }

  return {
    attemptsOverResolved,
    attemptsOverUnreached,
    attemptsOverUnresolved,
    attemptsSharingPerformance,
    demonstrationRateOverResolved:
      attemptsOverResolved === 0 ? null : demonstrationsOverResolved / attemptsOverResolved,
    demonstrationRateOverUnresolved:
      attemptsOverUnresolved === 0 ? null : demonstrationsOverUnresolved / attemptsOverUnresolved,
    demonstrationsOverResolved,
    demonstrationsOverUnresolved,
  };
}

/** Whether the next attempt after a miss was a demonstration — see `RecoveryAfterMiss`. */
function recoveryAfterMissOf(rows: readonly LearnerEvidence[]): RecoveryAfterMiss {
  const nextAttemptEvidence: Record<AttemptEvidence, number> = {
    contradicted: 0,
    demonstrated: 0,
    nothing_produced: 0,
    partial: 0,
  };
  let missesWithLaterAttempt = 0;
  let recovered = 0;

  for (const objectiveRows of byObjective(rows).values()) {
    // 🔴 ATTEMPTS ONLY, AND THE FILTER IS BEFORE THE PAIRING RATHER THAN INSIDE IT. An answer that
    // never mentioned this objective sits between a miss and the real next attempt; leaving it in
    // would make "the next attempt" a row where the learner did nothing at all.
    const attempts = ascending(objectiveRows).filter(attemptEvidenceOf);
    for (const [index, row] of attempts.entries()) {
      if (!isMiss(row)) continue;
      const next = attempts[index + 1];
      if (!next) continue;
      missesWithLaterAttempt += 1;
      nextAttemptEvidence[attemptEvidenceOf(next)!] += 1;
      if (isMastery(next)) recovered += 1;
    }
  }

  return {
    missesWithLaterAttempt,
    nextAttemptEvidence,
    // 🔴 `null`, NOT 0, WHEN NO MISS EVER GOT A SECOND CHANCE. A rate of 0 would say the teaching
    // after a miss never worked; the truth would be that it was never given the opportunity to.
    recoveryRate: missesWithLaterAttempt === 0 ? null : recovered / missesWithLaterAttempt,
    recovered,
  };
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Summarise one arm's rows.
 *
 * 🔴 THE CALLER HAS ALREADY FILTERED TO ONE ARM. This does not filter, because a function that both
 * selected a cohort and summarised it could silently disagree with the selection used elsewhere —
 * and a comparison whose two halves were selected by different rules is not a comparison.
 */
export function summariseStrategy(
  strategy: TeachingStrategyId,
  rows: readonly LearnerEvidence[],
  context: OutcomeContext = {},
): StrategyOutcomeSummary {
  const grouped = byObjective(rows);
  const durablyDemonstrated = new Set<string>();
  const timeToMastery: number[] = [];
  let mastered = 0;
  let repeatedErrors = 0;
  let nothingProduced = 0;
  let askedAgainTooSoon = 0;
  let delayedOpportunities = 0;
  let delayedDemonstrations = 0;
  let immediateOpportunities = 0;
  let immediateDemonstrations = 0;
  let transfer = 0;
  const operationsSeen = new Set<string>();

  for (const objectiveRows of grouped.values()) {
    const ordered = ascending(objectiveRows);
    const first = ordered[0]!;
    let seenError = false;
    let masteredAt: string | null = null;
    const operationsDemonstrated = new Set<string>();

    for (const [index, row] of ordered.entries()) {
      if (row.operation) operationsSeen.add(row.operation);
      if (isNothingProduced(row)) nothingProduced += 1;
      if (isError(row)) {
        if (seenError) repeatedErrors += 1;
        seenError = true;
      }
      if (isMastery(row)) {
        if (!masteredAt) {
          masteredAt = row.occurredAt;
          mastered += 1;
          timeToMastery.push(Date.parse(row.occurredAt) - Date.parse(first.occurredAt));
        }
        // 🔴 TRANSFER IS A SECOND OPERATION ON AN OBJECTIVE ALREADY DEMONSTRATED AT A FIRST. Counting
        // any demonstration at a new operation would count the very first one as transfer, which is
        // just the objective being met.
        if (row.operation && operationsDemonstrated.size > 0 && !operationsDemonstrated.has(row.operation)) {
          transfer += 1;
        }
        if (row.operation) operationsDemonstrated.add(row.operation);
      }

      const previous = index > 0 ? ordered[index - 1] : null;
      if (previous) {
        const gap = Date.parse(row.occurredAt) - Date.parse(previous.occurredAt);
        // 🔴 THE DENOMINATOR IS OPPORTUNITIES WITH A REAL GAP, NOT ALL OPPORTUNITIES. Asking what
        // fraction of ALL retrievals were delayed would measure how often the learner took a break,
        // not how well they held on to anything across one.
        if (gap >= RETENTION_DELAY_MS) {
          delayedOpportunities += 1;
          if (isMastery(row)) {
            delayedDemonstrations += 1;
            // The headline counts the OBJECTIVE once however often it is durably re-demonstrated —
            // see `objectivesDurablyDemonstrated`.
            durablyDemonstrated.add(row.objectiveIdentityKey);
          }
        } else {
          // The other half of the same population — see `immediatePostTestRate`. Every opportunity
          // with a preceding act lands in exactly one of these two branches, which is what makes the
          // two rates comparable without anyone re-deriving the denominator.
          immediateOpportunities += 1;
          if (isMastery(row)) immediateDemonstrations += 1;
        }
        // Asked again while the previous answer had already established it, inside the window in
        // which asking measures the last few minutes rather than memory.
        if (masteredAt && gap < RETENTION_DELAY_MS && Date.parse(row.occurredAt) > Date.parse(masteredAt)) {
          askedAgainTooSoon += 1;
        }
      }
    }
  }

  const scaffolding = rows
    .map((row) => row.scaffoldingLevel)
    .filter((level): level is number => typeof level === "number");
  // 🔴 EVERY OBSERVATION AT THE FLOOR MEANS NOTHING WAS SCAFFOLDED, WHICH IS NOT THE SAME AS "BOTH
  // ARMS SCAFFOLDED EQUALLY". Reported as absent so a reader cannot read a tie out of an instrument
  // that has only one setting. See the field's own comment.
  const scaffoldingObserved = scaffolding.length > 0 && scaffolding.some((level) => level > 0);

  const { activeAttentionMs, performancesWithLatency } = activeAttentionOf(rows);
  // 🔴 BOTH ABSENCES COLLAPSE TO `null` AND NEITHER MAY COLLAPSE TO 0 — see the field's own comment.
  // No latency means no denominator; no delayed opportunity means retention was never instrumented,
  // so a numerator of zero counted nothing rather than found nothing.
  const durableRate =
    activeAttentionMs === null || activeAttentionMs === 0 || delayedOpportunities === 0
      ? null
      : durablyDemonstrated.size / (activeAttentionMs / HOUR_MS);

  return {
    activeAttentionMs,
    askedAgainTooSoon,
    coverage: context.coverage ? attentionCoverageOf(context.coverage, rows) : null,
    deferredPrerequisites: context.prerequisites
      ? deferredPrerequisiteOutcome(rows, context.prerequisites, context.history ?? rows)
      : null,
    delayedRetentionRate: delayedOpportunities === 0 ? null : delayedDemonstrations / delayedOpportunities,
    durableDemonstrations: delayedDemonstrations,
    durableDemonstrationsPerActiveHour: durableRate,
    durableOpportunities: delayedOpportunities,
    immediatePostTestRate:
      immediateOpportunities === 0 ? null : immediateDemonstrations / immediateOpportunities,
    interactions: new Set(rows.map(performanceKey)).size,
    meanScaffoldingLevel: scaffoldingObserved
      ? scaffolding.reduce((sum, level) => sum + level, 0) / scaffolding.length
      : null,
    medianTimeToMasteryMs: median(timeToMastery),
    nothingProduced,
    objectivesDurablyDemonstrated: durablyDemonstrated.size,
    objectivesMastered: mastered,
    objectivesTouched: grouped.size,
    performancesWithLatency,
    recoveryAfterMiss: recoveryAfterMissOf(rows),
    repeatedErrors,
    strategy,
    timeToMasteryMs: [...timeToMastery].sort((a, b) => a - b),
    // 🔴 `null` RATHER THAN 0 WHEN THIS COHORT SHOWS ONLY ONE OPERATION — a 0 would be read as "this
    // arm produced no transfer", and the truth is that transfer was not measured on it. The runtime
    // stages four operations now; see the field's own comment for what changed.
    transferDemonstrations: operationsSeen.size > 1 ? transfer : null,
  };
}

/**
 * Both arms, side by side, from one learner's evidence.
 *
 * 🔴 ROWS WITH NO ARM ARE EXCLUDED, NOT ASSIGNED TO THE CONTROL. Absent means the row predates the
 * strategy layer — see the migration — and folding those into `nemesis_policy` would enrol months of
 * pre-experiment behaviour into one arm's result, which would look completely ordinary and be
 * completely wrong.
 *
 * 🔴 AND AN ARM WITH NO ROWS STILL APPEARS, WITH ZEROS AND NULLS. Omitting it would make "this arm
 * never ran" indistinguishable from "this arm was not asked about", and the first is exactly what a
 * refusal rate would be telling you.
 */
export function compareStrategies(
  evidence: readonly LearnerEvidence[],
  context: OutcomeContext = {},
): Record<TeachingStrategyId, StrategyOutcomeSummary> {
  const summaries = {} as Record<TeachingStrategyId, StrategyOutcomeSummary>;
  for (const strategy of TEACHING_STRATEGIES) {
    summaries[strategy] = summariseStrategy(
      strategy,
      evidence.filter((row) => row.teachingStrategy === strategy),
      // 🔴 THE FULL LOG IS THE HISTORY, INCLUDING THE ROWS THIS ARM DID NOT WRITE. Whether the
      // learner holds a prerequisite is a fact about the learner; if the other arm taught it, this
      // arm did not ask over a hole. Passing only the arm's own rows would file every objective the
      // other arm covered as never-reached, and the deferral measurement would quietly shrink to the
      // subset of prerequisites one controller happened to touch. A caller who deliberately wants the
      // narrower reading sets `history` and it is respected.
      { ...context, history: context.history ?? evidence },
    );
  }
  return summaries;
}
