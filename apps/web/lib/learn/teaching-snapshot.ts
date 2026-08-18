// Everything a teaching controller may reason about, derived once, in one place.
//
// 🔴🔴 THIS FILE ENDS A DELIBERATE STARVATION. `strategy-llm-teacher.ts` used to be handed exactly
// six facts per objective — status, times met, demonstrations, last verdict, minutes ago, competing
// beliefs — under an explicit rule: *"EXACTLY WHAT `decideNext` READS, AND NOTHING MORE"*. That rule
// made the two arms comparable and it made the model arm blind: Nemesis computes prerequisite edges,
// predicted forgetting, terminology friction, scaffolding history and response latency, and then
// withheld all of it. `docs/canvas-teaching-policy-audit.md` §5 names the trade — *"the thing that
// makes the comparison fair is the thing that makes the model arm weak"* — and the owner has ruled:
// *"Do not preserve an intentionally starved LLM simply to preserve the old experiment. The
// experiment I care about is handwritten pedagogical policy versus general model reasoning over
// useful learner state."*
//
// 🔴 SO BOTH ARMS READ THIS, AND THAT KEEPS THE COMPARISON HONEST WITHOUT KEEPING IT POOR. The
// structured policy already computes these signals internally and always did; what changes is that
// the model arm can see them too. Same information, different reasoning about it — which is the
// comparison the owner actually asked for.
//
// 🔴 DERIVED, NEVER STORED. Not one number here is written to a table. Every field is recomputed
// from durable evidence on every call, which is what lets the whole file be rewritten the day a
// better derivation exists without migrating a single row — the same property `next-action-value.ts`
// and `strategy-outcomes.ts` are built on, and the reason none of them can quietly become a score
// on a person.
//
// 🔴 AND IT REUSES THE EXISTING FUNCTIONS RATHER THAN RE-DERIVING THEM. `projectLearnerState`,
// `prerequisiteMap`, `retrievabilityFor`, `terminologyFriction`, `isUnresolvedAttempt` — every one is
// imported, not reimplemented. Two definitions of "is this unresolved" would let a snapshot and a
// score tell different stories about identical evidence, which is precisely the class of defect
// `runtime-support.ts` was created to end one layer up.

import { actsOnObjective, msOnObjective, MAX_IDLE_MS, type TeachingAct } from "./attention-budget";
import type { ErrorType } from "./canvas-model";
import type { ResolvedObjective } from "./canvas-knowledge";
import { projectLearnerState, type LearnerEvidence, type LearnerObjectiveState } from "./learner-evidence";
import { terminologyFriction, type TermLookup } from "./learner-friction";
import type { KnowledgeObject, KnowledgeType } from "./knowledge-types";
import { isUnresolvedAttempt } from "./next-action-value";
import { dependentsOf, prerequisiteMap, termsOf } from "./objective-prerequisites";
import { retrievabilityFor } from "./retention-model";
import { readRung, type ScaffoldRung } from "./scaffold-rung";
import { semanticKeysOf, semanticRelationSummary, semanticRelationsOf } from "./semantic-relations";
import type { MaterialScope, TeachingContext } from "./teaching-strategy";

/**
 * One objective, as much as is honestly known about it.
 *
 * 🔴 EVERY FIELD THAT CAN BE UNOBSERVED IS `| null`, AND A READER MUST NOT COALESCE IT. This is the
 * defect this repo has paid for more often than any other: `?? 0` turns "we did not observe this"
 * into "we observed none of it", and the two are opposite. A model told `retrievability: 0` will
 * conclude the learner has forgotten something they were never asked.
 */
export interface ObjectiveSnapshot {
  identityKey: string;
  /** What the objective asks about, in the learner's own material's words. */
  label: string;
  /** The demand: recall, predict, discriminate, sequence. */
  capability: string;
  knowledgeType: KnowledgeType;
  /** What the source actually said. The only claim about the world in this whole structure. */
  statement: string;
  /** Overlapping semantic structure, including open-world relationship names. */
  semanticRelations: readonly string[];
  /** Conservative role-value joins used only to retrieve a relevant structural neighborhood. */
  semanticKeys: readonly string[];

  // ── what the learner has shown ────────────────────────────────────────────
  state: LearnerObjectiveState;
  /** Attempts that came back wrong, partial, or with nothing produced. */
  unresolvedAttempts: number;
  /** Minutes since the last evidence of any kind. `null` when there has never been any. */
  minutesSinceLastEvidence: number | null;
  /**
   * Competing beliefs a judge actually observed.
   *
   * 🔴 OBSERVED, NEVER INFERRED, AND A CONTROLLER MAY NOT ADD TO THIS LIST. Naming a false belief is
   * authoring a claim about a person; the log holds the ones that were really seen. A model-supplied
   * misconception would have Nemesis teaching against a mistake nobody made — a fabrication, not a
   * teaching difference. `strategy-llm-teacher.ts` derives `competingWith` from here for that reason.
   */
  misconceptions: readonly string[];
  /**
   * The KIND of failure the evaluator named most recently on this objective, or null when it has
   * never named one.
   *
   * 🔴 THE LATEST, NOT A TALLY, AND THAT IS A CLAIM ABOUT WHAT A DIAGNOSIS IS. Counting kinds would
   * say "three careless, two conceptual" about a learner who has since stopped making either — the
   * useful fact is what went wrong the last time they tried, because that is what the next move has
   * to answer. A history of kinds is a different question, and the rows are all still there for
   * anyone who wants to ask it.
   *
   * 🔴 NULL MEANS NO KIND WAS EVER NAMED — never "no failures". An objective with three wrong
   * answers and no diagnosis reads null here and `unresolvedAttempts: 3` above, and a controller
   * that confused the two would conclude the learner was doing fine.
   */
  lastErrorType: ErrorType | null;
  /**
   * Typical time this learner has taken to answer this, in milliseconds. `null` when unrecorded.
   *
   * 🔴 A SIGNAL ALREADY IN THE DATABASE THAT NOTHING READ. `objective-task.ts:669` writes
   * `responseLatencyMs` on every row and `learner-store.ts` persists it; the audit found no consumer
   * anywhere. It is here because the owner named it, and it is a MEDIAN because one interrupted
   * answer would otherwise dominate a mean over three.
   *
   * 🔴 AND IT IS EVIDENCE, NEVER A VERDICT. Slow is not wrong. `canvas-model.ts` already warns that
   * *"a model that forgets which one happened will read hesitation into a fast typist"*; the same
   * caution is passed to the controller in words rather than enforced as a rule, because how much
   * hesitation means is a teaching judgement and not a truth.
   */
  medianResponseMs: number | null;
  /** The demand the last attempt was actually staged at. `null` when nothing recorded one. */
  lastRung: ScaffoldRung | null;

  // ── what the material says about it ───────────────────────────────────────
  /**
   * Objectives that build on this one and which the learner is currently stuck on.
   *
   * 🔴 STUCK, NEVER MERELY DEPENDENT. Counting every downstream term would put the foundations of
   * every chain permanently above everything built on them — a curriculum wearing a learner model's
   * clothes. What earns the mention is that the learner has ALREADY TRIED the dependent and it did
   * not go well. See `objective-prerequisites.ts` for how carefully the edge refuses to be built.
   */
  blockedDependents: readonly string[];
  /** Objectives this one is built on. Empty when the extractor emitted no certain edge. */
  prerequisites: readonly string[];
  /**
   * Predicted probability of successful retrieval right now, 0-1. `null` when there is nothing to
   * estimate from — never demonstrated, or demonstrated only by a reveal.
   *
   * 🔴 `null` IS NOT "CERTAIN TO FAIL". See `retention-model.ts`.
   */
  retrievability: number | null;
  /** The learner has repeatedly stopped to look up words this objective is built from. */
  terminologyInTheWay: boolean;
  /**
   * How central the source's own structure makes this. `null` until the importance signal reads it.
   *
   * 🔴 A STRING, NOT A NUMBER, AND ABSENT UNTIL IT IS REAL. An ordinal cannot be quietly summed into
   * a score, which is the whole reason it is not a float. `null` means the reading has not landed —
   * it must never be read as "unimportant", which would make a controller skip everything a
   * not-yet-instrumented document contains.
   */
  importance: string | null;

  // ── what this sitting has already spent on it ─────────────────────────────
  /** Milliseconds of ACTIVE attention this sitting has given this objective. */
  msThisSession: number;
  /** How many separate acts this sitting has staged on it. */
  actsThisSession: number;
}

export interface TeachingSnapshot {
  objectives: readonly ObjectiveSnapshot[];
  scope: MaterialScope;
}

/** The median, or `null` over nothing. Median rather than mean for the reason
 *  `strategy-outcomes.ts` states at length: a mean over a bimodal population describes nobody. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * How prominently the source treats this, if anything has read it.
 *
 * 🔴🔴 THE FIELD IS `standing`, AND MY FIRST VERSION READ `rank` THROUGH A STRUCTURAL CAST — so it
 * compiled, every test passed, and it returned `null` for every objective in the corpus for ever.
 * That is this repo's signature defect (a lane implemented, merged and dead) caught at the one seam
 * where two lanes met. The cast is gone: this reads the real type, so renaming the field on the
 * other side is now a compile error rather than a silent `null`.
 *
 * 🔴 IT IS PROMINENCE IN THE SOURCE, NEVER WORTH LEARNING. `source-importance.ts` is explicit about
 * that distinction and it must survive the trip: what reaches the controller is "the document
 * foregrounds this", and turning that into teaching priority is the controller's judgement to make.
 *
 * 🔴 REPLICATED ACROSS EVERY OBJECTIVE MINTED FROM ONE KNOWLEDGE OBJECT, NEVER DIVIDED AMONG THEM.
 * The join is one-to-many — a procedure mints one objective per step — and dividing would make an
 * eight-step procedure the source dwells on read as one-eighth as prominent per step as a passing
 * one-line fact. That inverts the truth. Importance is a property of the material, and every
 * objective asking about that material inherits it whole.
 *
 * 🔴 AND `null` MEANS UNREAD, NEVER UNIMPORTANT. Measured on production, importance refuses more
 * often than it reads (35 of 83 objects on one document); a default of "peripheral" would make a
 * controller skip most of a document because nothing had looked at it yet.
 */
function importanceOf(knowledge: KnowledgeObject): string | null {
  return knowledge.importance?.standing ?? null;
}

/**
 * Everything both controllers may read, derived from one context.
 *
 * PURE. `now` comes from the context. No clock, no network, no model.
 */
export function teachingSnapshot(context: TeachingContext): TeachingSnapshot {
  const acts: readonly TeachingAct[] = context.recentActs ?? [];
  const lookups: readonly TermLookup[] = context.lookups ?? [];
  const nowMs = context.now.getTime();

  // 🔴 THE EDGE, BUILT ONCE PER SNAPSHOT AND NEVER STORED — the same construction and the same
  // reason as `policy-runtime.ts`: a dependency graph in a table becomes a curriculum somebody has
  // to migrate, while one recomputed from the knowledge on hand can be rewritten the day a better
  // rule exists.
  const prerequisites = prerequisiteMap(
    context.objectives.map((entry) => ({
      identityKey: entry.objective.identityKey,
      knowledge: entry.knowledge,
      parameters: entry.objective.parameters,
    })),
  );
  const dependents = dependentsOf(prerequisites);

  const states = new Map<string, { state: LearnerObjectiveState; mine: LearnerEvidence[] }>();
  for (const entry of context.objectives) {
    const key = entry.objective.identityKey;
    // 🔴 FILTERED BY OBJECTIVE, NEVER BY CANVAS — the durable learner model spans sessions, and a
    // canvas filter here would silently turn it back into a session transcript while every test
    // still passed. Same rule, same words, as `decideNext`.
    const mine = context.evidence.filter((row) => row.objectiveIdentityKey === key);
    states.set(key, { mine, state: projectLearnerState(key, mine) });
  }

  const stuck = new Set(
    [...states.entries()]
      .filter(([, { state }]) => STUCK.includes(state.status))
      .map(([key]) => key),
  );

  const objectives = context.objectives.map((entry): ObjectiveSnapshot => {
    const key = entry.objective.identityKey;
    const { mine, state } = states.get(key)!;
    const { establishes, requires } = termsOf(entry.knowledge);
    const latencies = mine
      .map((row) => row.responseLatencyMs)
      .filter((ms): ms is number => typeof ms === "number" && ms > 0);
    // Newest last, which is the order every reader in this directory assumes.
    const lastWithRung = [...mine].reverse().find((row) => row.scaffoldRung !== undefined);

    return {
      actsThisSession: actsOnObjective(key, acts),
      blockedDependents: (dependents.get(key) ?? []).filter((dependent) => stuck.has(dependent)),
      capability: entry.objective.capability,
      identityKey: key,
      importance: importanceOf(entry.knowledge),
      knowledgeType: entry.knowledge.type,
      label: entry.objective.label,
      lastRung: lastWithRung ? readRung(lastWithRung.scaffoldRung) : null,
      medianResponseMs: median(latencies),
      minutesSinceLastEvidence: state.lastEvidenceAt
        ? Math.round((nowMs - Date.parse(state.lastEvidenceAt)) / 60_000)
        : null,
      // 🔴 THE LAST ROW THAT NAMED ONE, NOT THE LAST ROW. Evidence is ordered oldest-first, so this
      // walks back to the most recent DIAGNOSIS — an answer the judge could not classify does not
      // erase what the one before it established. `find` on the reversed list would read the newest
      // row and report null for a learner whose last diagnosed failure was two attempts ago.
      lastErrorType:
        [...mine].reverse().find((row) => row.errorType !== undefined)?.errorType ?? null,
      misconceptions: [
        ...new Set(mine.filter((row) => row.verdict === "misconception").flatMap((row) => row.misconceptions ?? [])),
      ],
      msThisSession: msOnObjective({ acts, maxIdleMs: MAX_IDLE_MS, nowMs, objectiveIdentityKey: key }),
      prerequisites: prerequisites.get(key) ?? [],
      retrievability: retrievabilityFor(mine, context.now),
      semanticKeys: semanticKeysOf(entry.knowledge),
      semanticRelations: semanticRelationsOf(entry.knowledge).map(semanticRelationSummary),
      state,
      statement: entry.knowledge.statement,
      terminologyInTheWay:
        lookups.length > 0 && terminologyFriction({ lookups, terms: [...requires, ...establishes] }).present,
      unresolvedAttempts: mine.filter(isUnresolvedAttempt).length,
    };
  });

  return { objectives, scope: scopeOf(context.objectives, objectives) };
}

/** The learner met this and it did not go well. 🔴 `unknown` is deliberately OUT: "we have never
 *  asked" is Nemesis lacking evidence, not the learner being stuck. Same list, same reason, as
 *  `policy-runtime.ts`'s `STUCK_STATUSES`. */
const STUCK: readonly LearnerObjectiveState["status"][] = [
  "not_demonstrated",
  "incorrect",
  "misconception",
  "partial",
];

function scopeOf(
  resolved: readonly ResolvedObjective[],
  snapshots: readonly ObjectiveSnapshot[],
): MaterialScope {
  const important = snapshots.filter((snapshot) => snapshot.importance === "central");
  // 🔴 ANY importance READING AT ALL IS WHAT MAKES THE WEIGHTED COUNTS MEANINGFUL, NOT A NON-ZERO
  // COUNT OF CENTRAL ONES. A document read by the importance signal that genuinely contains nothing
  // central must report `importantTotal: 0`, which is a finding; a document nothing has read must
  // report `null`. Keying on "did anything produce a reading" is the only way to tell those apart.
  const read = snapshots.some((snapshot) => snapshot.importance !== null);
  return {
    demonstrated: snapshots.filter((snapshot) => snapshot.state.status === "correct").length,
    importantDemonstrated: read ? important.filter((s) => s.state.status === "correct").length : null,
    importantTotal: read ? important.length : null,
    total: resolved.length,
    touched: snapshots.filter((snapshot) => snapshot.state.evidenceCount > 0).length,
  };
}
