// A predicted probability of successful retrieval right now — the spacing signal the ranker reads.
//
// 🔴 THIS IS THE FILE `retrieval-eligibility.ts` ALREADY NAMED. Its own header says plainly: "FSRS
// belongs DOWNSTREAM of evidence, and when it exists it supersedes this file rather than being
// negotiated with it." Read literally that would mean replacing the flat ten-minute gate outright —
// and the file also carries a SEPARATE, dated, explicit product ruling: *"RULED BY THE OWNER,
// 2026-08-13: TEN MINUTES… the interval a learner actually experiences must EQUAL it."* The two
// statements are about different things. The header is architecture, describing a mechanism that
// may someday replace a crude one; the ruling is tempo, a specific number the owner fixed and said
// is not a placeholder. Retrievability at ten minutes elapsed is effectively 1.0 for every reachable
// stability (computed: ~0.999 at the SHORTEST modelled stability, 0.6 days), so swapping the GATE for
// a retrievability threshold would never shorten the wait — it would silently stretch it to hours or
// days, overriding a ruling rather than superseding a placeholder. So `eligibleForRetrieval` is left
// exactly as it is. What this file adds is the other half of deliverable 3: due/overdue as a RANKING
// signal among objectives that are ALREADY eligible, not a second opinion on when the door opens.
//
// 🔴 ADAPTED FROM `canvas-retention.ts`, NOT RETHOUGHT FROM SCRATCH. A second, independently-reasoned
// spaced-repetition model living beside that one is exactly the "second spaced-repetition system
// invented inside the teaching policy" `retrieval-eligibility.ts` was written to refuse. The
// forgetting curve, the constants and the stability walk below are the same math, reviewed and
// justified there — this file's only real job is reading it off `LearnerEvidence`, the durable log
// the live decision path actually holds, instead of the legacy `LearningCanvas`/`recallResults`
// shape `canvas-retention.ts` was built against (which — measured — is wired to nothing today; see
// the audit this file's companion commit reports).
//
// 🔴 EVIDENCE-FIRST, THE SAME RULE EVERYWHERE ELSE IN THIS DIRECTORY. Only rows `establishesBelief`
// stands behind are folded — the identical gate `projectLearnerState` applies before drawing any
// conclusion. An untrusted `strong` must not grant stability here that the projection refused to
// grant `correct` status for; that would be two disagreeing readings of one log, and nothing would
// ever compare them.
//
// PURE. `now` is a parameter, never read from the clock — the caller supplies it, the same
// convention `eligibleForRetrieval` and `chooseNextTeachingAction` already use.

import { establishesBelief, type LearnerEvidence } from "./learner-evidence";

const DAY_MS = 86_400_000;

/** The FSRS forgetting curve: R(t) = (1 + F·t/S)^C — identical to `canvas-retention.ts`'s constants,
 *  reused rather than re-derived so the two files cannot quietly disagree about the curve's shape. */
const FACTOR = 19 / 81;
const DECAY = -0.5;

type PassGrade = "hard" | "good" | "easy";

/** Stability, in days, granted by a first successful retrieval at each grade. Same values as
 *  `canvas-retention.ts` — coarse and deliberately conservative; see that file's note on tuning
 *  against Nemesis's own review logs rather than someone else's flashcards, which applies here too. */
const INITIAL_STABILITY: Record<PassGrade, number> = { hard: 0.6, good: 1.5, easy: 3 };

interface TimedGrade {
  at: number;
  passed: boolean;
  grade: PassGrade;
}

function passed(verdict: LearnerEvidence["verdict"]): boolean {
  return verdict === "strong" || verdict === "understood";
}

function gradeOf(verdict: LearnerEvidence["verdict"]): PassGrade {
  if (verdict === "strong") return "easy";
  if (verdict === "understood") return "good";
  return "hard";
}

/**
 * This objective's believable, demonstrated, dated evidence, oldest first.
 *
 * 🔴 THREE FILTERS, EACH REFUSING A DIFFERENT WAY OF NOT KNOWING. `establishesBelief` drops a
 * reading the judge itself was not confident in. `demonstrationObtained && verdict` drops a revealed
 * answer or a gave-up — an opportunity spent with nothing to grade is not a data point on a curve
 * about what was retained. An unparseable `occurredAt` drops a row this file cannot place in time,
 * the same as `canvas-retention.ts`'s "excluded, not backfilled" rule for undated evidence.
 */
function timedGrades(evidence: readonly LearnerEvidence[]): TimedGrade[] {
  return evidence
    .filter(establishesBelief)
    .filter((row) => row.demonstrationObtained && row.verdict)
    .map((row) => ({ at: Date.parse(row.occurredAt), grade: gradeOf(row.verdict), passed: passed(row.verdict) }))
    .filter((entry) => !Number.isNaN(entry.at))
    .sort((a, b) => a.at - b.at);
}

/** Stability in days, walked forward through the evidence — identical logic to
 *  `canvas-retention.ts`'s `stabilityFor`, reproduced here rather than imported so this module has
 *  no dependency on the legacy `LearningCanvas` file it is explicitly not building on. */
function stabilityFor(entries: readonly TimedGrade[], difficulty: number): number | null {
  let stability: number | null = null;
  let previousAt: number | null = null;

  for (const entry of entries) {
    if (!entry.passed) {
      stability = stability === null ? 0.2 : Math.max(0.2, stability * 0.4);
      previousAt = entry.at;
      continue;
    }
    if (stability === null) {
      stability = INITIAL_STABILITY[entry.grade];
    } else {
      const elapsedDays = previousAt === null ? 0 : (entry.at - previousAt) / DAY_MS;
      const survived = Math.min(elapsedDays / stability, 2);
      const easeBonus = entry.grade === "easy" ? 1 : entry.grade === "good" ? 0.7 : 0.35;
      const growth = 1 + survived * easeBonus * (1 - difficulty * 0.6);
      stability *= growth;
    }
    previousAt = entry.at;
  }
  return stability;
}

/**
 * Predicted probability of successful retrieval right now, for one objective's evidence — 0 to 1,
 * or `null` when there is nothing to estimate from.
 *
 * 🔴 NULL IS "UNKNOWN", NEVER ZERO. An objective never demonstrated, or demonstrated but only ever
 * revealed or given up on, has no curve to be on — that is a different fact from "certain to fail",
 * and `next-action-value.ts` must not treat the two the same.
 *
 * 🔴 "LOW RETRIEVABILITY" IS NOT "FORGOTTEN" — `canvas-retention.ts`'s own invariant, held here too.
 * Nothing this function returns is a claim about what the learner currently knows; it is a reason to
 * rank asking them higher, and the only thing that ever settles the question is their next answer.
 */
export function retrievabilityFor(evidence: readonly LearnerEvidence[], now: Date): number | null {
  const entries = timedGrades(evidence);
  const lastPass = [...entries].reverse().find((entry) => entry.passed);
  if (!lastPass) return null;

  const failures = entries.length - entries.filter((entry) => entry.passed).length;
  const difficulty = entries.length === 0 ? 0.5 : failures / entries.length;
  const stabilityDays = stabilityFor(entries, difficulty);
  if (stabilityDays === null || stabilityDays <= 0) return null;

  const elapsedDays = Math.max(0, (now.getTime() - lastPass.at) / DAY_MS);
  return Math.min(1, Math.max(0, (1 + (FACTOR * elapsedDays) / stabilityDays) ** DECAY));
}
