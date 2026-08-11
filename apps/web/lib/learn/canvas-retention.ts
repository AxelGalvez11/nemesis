// Forgetting continues while Nemesis is closed.
//
// A learner who retrieves something on Monday and comes back on Friday has had four days pass.
// The obvious implementation of that is a job that walks every user every hour and decays a
// number — and it is wrong twice over: it costs compute proportional to users × time for a
// value nobody is reading, and it turns memory into a thing the server does TO the learner
// rather than a property of when they last showed us something.
//
// So nothing runs while they are away (§33). Retrievability is a function of stored timestamps,
// evaluated at the moment somebody asks. Four days of decay costs exactly one subtraction.
//
// 🔴 AND IT IS DERIVED FROM EVIDENCE, NOT STORED ALONGSIDE IT. There is no `stability` column
// and no retention field on the canvas. Recall results and responses already carry `at` and a
// judged verdict, and that IS the history — a stored stability would be a second copy of the
// truth that drifts the first time evidence is corrected or a round is replayed. This mirrors
// the rule the whole canvas is built on: evidence is the record, everything else is a view of
// it.
//
// 🔴 "PREDICTED TO HAVE DECAYED" IS NOT "FORGOTTEN" (§35). Nothing here returns a verdict about
// what the learner knows. Elapsed time is a reason to ASK — never a reason to conclude. The
// exported gate is called `needsFreshEvidence` for that reason, and a test asserts no amount of
// elapsed time can turn into a claim of loss.

import type { LearningCanvas, ResponseEvaluation } from "./canvas-model";

const DAY_MS = 86_400_000;

/** The FSRS forgetting curve: R(t) = (1 + F·t/S)^C.
 *
 *  These are the published FSRS-4.5 constants, used because the shape is right — retrievability
 *  falls fast at first and then flattens, which is what the spacing effect actually looks like
 *  and is not what an exponential gives you. */
const FACTOR = 19 / 81;
const DECAY = -0.5;

/** Stability, in days, granted by a first successful retrieval at each grade. Coarse and
 *  deliberately conservative — see the note on `stabilityFor`. */
const INITIAL_STABILITY: Record<PassGrade, number> = { hard: 0.6, good: 1.5, easy: 3 };

/** Below this predicted retrievability, the objective is worth asking about again. 0.9 is the
 *  usual spaced-repetition target: ask while recall is still likely, because a failed retrieval
 *  at 0.5 has already cost the learner the thing we were trying to protect. */
const FRESH_EVIDENCE_BELOW = 0.9;

type PassGrade = "hard" | "good" | "easy";

export interface RetentionView {
  objectiveId: string;
  /** When we last saw a successful retrieval. Null when we never have, or when the evidence we
   *  have carries no timestamp — see `timestampedEvidence`. */
  lastRetrievalAt: string | null;
  /** Days this memory is estimated to survive. Null when there is nothing to estimate from. */
  stabilityDays: number | null;
  /** 0 (easy for this learner) to 1 (hard). Derived from how often they have missed it. */
  difficulty: number;
  successes: number;
  failures: number;
  /** Predicted probability of successful retrieval right now, 0-1. Null when unknown — which is
   *  a different thing from zero, and must not be rendered as "you have forgotten this". */
  retrievability: number | null;
}

/** One piece of judged evidence for one objective, with a time attached. */
interface TimedEvidence {
  at: number;
  passed: boolean;
  grade: PassGrade;
}

function passed(evaluation: ResponseEvaluation): boolean {
  return evaluation.verdict === "strong" || evaluation.verdict === "understood";
}

function gradeOf(evaluation: ResponseEvaluation): PassGrade {
  if (evaluation.verdict === "strong") return "easy";
  if (evaluation.verdict === "understood") return "good";
  return "hard";
}

/** Every timestamped, judged piece of evidence for each objective, oldest first.
 *
 *  🔴 Evidence with no `at` is EXCLUDED, not backfilled. Records written before we captured
 *  timestamps are honestly undated, and assigning them "now" would make an old success look
 *  like a fresh one — which is precisely the error this module exists to avoid making in the
 *  other direction. They still count towards the diagnosis; they just cannot date anything. */
function timestampedEvidence(canvas: LearningCanvas): Map<string, TimedEvidence[]> {
  const byObjective = new Map<string, TimedEvidence[]>();

  const add = (objectiveId: string | null | undefined, at: string | undefined, evaluation?: ResponseEvaluation) => {
    if (!objectiveId || !at || !evaluation) return;
    const time = Date.parse(at);
    if (Number.isNaN(time)) return;
    const list = byObjective.get(objectiveId) ?? [];
    list.push({ at: time, passed: passed(evaluation), grade: gradeOf(evaluation) });
    byObjective.set(objectiveId, list);
  };

  for (const result of canvas.recallResults) add(result.conceptId, result.at, result.evaluation);
  for (const response of canvas.responses) {
    for (const objectiveId of response.objectiveIds ?? []) add(objectiveId, response.at, response.evaluation);
  }

  for (const list of byObjective.values()) list.sort((a, b) => a.at - b.at);
  return byObjective;
}

/** Stability in days, walked forward through the evidence.
 *
 *  🔴 A COARSE MODEL, AND LABELLED AS ONE. Real FSRS fits ~17 parameters against millions of
 *  reviews; this is a monotonic approximation with the properties that actually matter here:
 *  a success at a long gap is worth more than a success at a short one (you cannot prove
 *  durability by answering immediately), repeated successes compound, and a failure cuts
 *  stability rather than resetting it to nothing, because relearning something is faster than
 *  learning it. If this is ever tuned, it should be tuned against Nemesis's own review logs —
 *  not by importing constants fitted on someone else's flashcards. */
function stabilityFor(evidence: readonly TimedEvidence[], difficulty: number): number | null {
  let stability: number | null = null;
  let previousAt: number | null = null;

  for (const entry of evidence) {
    if (!entry.passed) {
      // Missed it. Keep some credit: this is relearning, not a first encounter.
      stability = stability === null ? 0.2 : Math.max(0.2, stability * 0.4);
      previousAt = entry.at;
      continue;
    }

    if (stability === null) {
      stability = INITIAL_STABILITY[entry.grade];
    } else {
      // How much of the previous estimate the learner actually survived. Answering after two
      // days when we predicted one is real evidence of durability; answering ten seconds later
      // is evidence of short-term memory.
      const elapsedDays = previousAt === null ? 0 : (entry.at - previousAt) / DAY_MS;
      const survived = Math.min(elapsedDays / stability, 2);
      const easeBonus = entry.grade === "easy" ? 1 : entry.grade === "good" ? 0.7 : 0.35;
      // Harder material grows more slowly. Difficulty is 0-1, so this is a 1.0-0.4 multiplier.
      const growth = 1 + survived * easeBonus * (1 - difficulty * 0.6);
      stability *= growth;
    }
    previousAt = entry.at;
  }

  return stability;
}

/** R(t) for one objective. Exported because it is the whole idea and deserves its own test. */
export function retrievabilityAt(
  lastRetrievalMs: number,
  stabilityDays: number,
  nowMs: number,
): number {
  const elapsedDays = Math.max(0, (nowMs - lastRetrievalMs) / DAY_MS);
  if (stabilityDays <= 0) return 0;
  return Math.min(1, Math.max(0, (1 + (FACTOR * elapsedDays) / stabilityDays) ** DECAY));
}

/** What we currently believe about every objective with dated evidence. */
export function retentionMap(canvas: LearningCanvas, now: Date): RetentionView[] {
  const nowMs = now.getTime();
  const evidence = timestampedEvidence(canvas);

  return canvas.concepts.map((concept): RetentionView => {
    const entries = evidence.get(concept.id) ?? [];
    const successes = entries.filter((entry) => entry.passed).length;
    const failures = entries.length - successes;
    const difficulty = entries.length === 0 ? 0.5 : failures / entries.length;

    const lastPass = [...entries].reverse().find((entry) => entry.passed) ?? null;
    const stabilityDays = stabilityFor(entries, difficulty);

    return {
      objectiveId: concept.id,
      lastRetrievalAt: lastPass ? new Date(lastPass.at).toISOString() : null,
      stabilityDays,
      difficulty,
      successes,
      failures,
      // 🔴 Null, not zero, when we have never seen a dated success. "We do not know" and "they
      // will certainly fail" are different claims and only one of them is true.
      retrievability:
        lastPass && stabilityDays !== null ? retrievabilityAt(lastPass.at, stabilityDays, nowMs) : null,
    };
  });
}

/** Objectives worth asking about again, most decayed first.
 *
 *  🔴 NAMED FOR WHAT IT MEANS. Not `forgotten`, not `lapsed`, not `due`. Time passing is a
 *  reason for Nemesis to go and find out — the learner's next answer is what decides the state,
 *  and until they give one we have a prediction and nothing more (§35). */
export function needsFreshEvidence(
  canvas: LearningCanvas,
  now: Date,
  threshold: number = FRESH_EVIDENCE_BELOW,
): RetentionView[] {
  return retentionMap(canvas, now)
    .filter((view) => view.retrievability !== null && view.retrievability < threshold)
    .sort((a, b) => (a.retrievability ?? 0) - (b.retrievability ?? 0));
}

/** When this objective next falls below the threshold — so a query can find it without the
 *  server having thought about this learner in the meantime (§34). Null when undatable. */
export function nextReviewAt(view: RetentionView, threshold: number = FRESH_EVIDENCE_BELOW): string | null {
  if (!view.lastRetrievalAt || view.stabilityDays === null) return null;
  // Invert R(t) = (1 + F·t/S)^C for t.
  const days = ((threshold ** (1 / DECAY) - 1) * view.stabilityDays) / FACTOR;
  return new Date(Date.parse(view.lastRetrievalAt) + days * DAY_MS).toISOString();
}
