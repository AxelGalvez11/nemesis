// Turning evidence into a review date — and nothing else.
//
// 🔴 THIS FILE IS AN ADAPTER, AND THE DIRECTION MATTERS. Nemesis first works out what a
// performance showed; only afterwards does it ask when to look for evidence again. FSRS is
// downstream of cognition, not the other way round. The moment scheduling vocabulary starts
// deciding what the canvas asks for or how it teaches, the product is a spaced-repetition app
// with a text box on it.
//
// So this file is deliberately small and one-directional. It reads a ResponseEvaluation and
// returns a grade. Nothing here decides what the canvas does next: an answer that was wrong
// because a term was forgotten and an answer that was wrong because the causal model is
// backwards both produce "again", and they need completely different teaching. That decision
// belongs to the teaching policy, reading `errorType` and `misconceptions` — not here.
//
// The signature takes more than the current answer on purpose. Most of it is unused today, and
// that is the point: the shape is where it will need to be when durable mastery is judged from
// delayed retrieval and transfer rather than from one confident sentence.

import type { ResponseEvaluation } from "./canvas-model";

export type FsrsGrade = "again" | "hard" | "good" | "easy";

export interface SchedulingSignal {
  grade: FsrsGrade;
  /** Why this grade, in one line. Kept so the adapter's reasoning stays inspectable instead of
   *  arriving at the scheduler as an unexplained number. */
  because: string;
}

export interface SchedulingInput {
  /** Null when no evidence was obtained — the learner revealed the answer, or the evaluation
   *  was refused. Absence of evidence is not evidence of knowing. */
  evaluation: ResponseEvaluation | null;
  /** The learner asked to see the answer instead of attempting it. */
  revealed?: boolean;
  hintsUsed?: number;
  /** How many times this concept has already been retrieved successfully, on earlier visits.
   *  The difference between "right just now" and "right again, later". */
  priorSuccesses?: number;
  /** Milliseconds since this material was last put in front of them. Zero or undefined means
   *  we are asking immediately after teaching it, which is the weakest kind of success. */
  timeSinceLastExposureMs?: number;
}

/** How long after being taught something a correct answer stops being a freebie. Twenty minutes
 *  is not a claim about memory — it is a floor chosen so "I read it thirty seconds ago" cannot
 *  present as durable recall. */
const DELAYED_MS = 20 * 60_000;

export function deriveSchedulingSignal(input: SchedulingInput): SchedulingSignal {
  if (input.revealed) {
    // §7: they needed the answer shown. That is a fact, and a better one than any self-report we
    // could ask for afterwards. We never obtained a retrieval, so we schedule another.
    return { grade: "again", because: "the answer was revealed rather than retrieved" };
  }

  const evaluation = input.evaluation;
  if (!evaluation) {
    // No reading of the answer. Not "again" — that would punish the learner for our failure —
    // and not "good" either, which would retire a card on nothing. "Hard" brings it back soon
    // without recording a failure that never happened.
    return { grade: "hard", because: "no evaluation was obtained for this answer" };
  }

  switch (evaluation.verdict) {
    case "strong": {
      // "Easy" is a claim about durability, and one immediate correct answer cannot support it:
      // someone who read the explanation a minute ago and repeats it has shown recall of the
      // page, not of the idea. Easy needs the answer to have come back unaided AND after a gap
      // or on a repeat visit. Otherwise a strong answer is simply a good one.
      const unaided = (input.hintsUsed ?? 0) === 0;
      const delayed = (input.timeSinceLastExposureMs ?? 0) >= DELAYED_MS;
      const repeated = (input.priorSuccesses ?? 0) >= 1;
      if (unaided && (delayed || repeated)) {
        return { grade: "easy", because: "unaided, and retrieved after a gap or on a repeat" };
      }
      return { grade: "good", because: "strong, but retrieved immediately after being taught" };
    }
    case "understood":
      return { grade: "good", because: "the performance covered what was expected" };
    case "partial":
      return { grade: "hard", because: "part of the expected evidence was missing" };
    case "misconception":
      // Same grade as a plain miss, deliberately: the scheduler only decides WHEN. What makes
      // this case different is what the canvas does before then, which is the policy's problem.
      return { grade: "again", because: "a false belief was demonstrated" };
    case "incorrect":
    default:
      return { grade: "again", because: "the performance did not reach the expected evidence" };
  }
}
