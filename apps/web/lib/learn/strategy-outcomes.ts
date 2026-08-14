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

import { performanceKey, type LearnerEvidence } from "./learner-evidence";
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
   * 🔴🔴 STRUCTURALLY UNMEASURABLE TODAY AND WILL READ `null`, WHICH IS A FACT ABOUT THE PRODUCT AND
   * NOT ABOUT THE ARMS. Transfer means showing the same knowledge under a different cognitive demand,
   * so it needs at least two operations to exist — and `objectivesForKnowledge` mints `recall` and
   * essentially nothing else, so every row carries the same `operation`. The metric is written now,
   * against the field that will carry it, so that the day a second operation ships this becomes
   * measurable without anyone rediscovering what it should have meant. Until then it must not be
   * reported as "no transfer difference": it is "no transfer measurement".
   */
  transferDemonstrations: number | null;
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
): StrategyOutcomeSummary {
  const grouped = byObjective(rows);
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
          if (isMastery(row)) delayedDemonstrations += 1;
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

  return {
    // Undefined rather than zero: one operation in the whole corpus means transfer was never
    // measurable, and a 0 would be read as "this arm produced no transfer".
    askedAgainTooSoon,
    delayedRetentionRate: delayedOpportunities === 0 ? null : delayedDemonstrations / delayedOpportunities,
    immediatePostTestRate:
      immediateOpportunities === 0 ? null : immediateDemonstrations / immediateOpportunities,
    interactions: new Set(rows.map(performanceKey)).size,
    meanScaffoldingLevel: scaffoldingObserved
      ? scaffolding.reduce((sum, level) => sum + level, 0) / scaffolding.length
      : null,
    medianTimeToMasteryMs: median(timeToMastery),
    nothingProduced,
    objectivesMastered: mastered,
    objectivesTouched: grouped.size,
    repeatedErrors,
    strategy,
    timeToMasteryMs: [...timeToMastery].sort((a, b) => a - b),
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
): Record<TeachingStrategyId, StrategyOutcomeSummary> {
  const summaries = {} as Record<TeachingStrategyId, StrategyOutcomeSummary>;
  for (const strategy of TEACHING_STRATEGIES) {
    summaries[strategy] = summariseStrategy(
      strategy,
      evidence.filter((row) => row.teachingStrategy === strategy),
    );
  }
  return summaries;
}
