// Learning arbitrary mappings: encode → group → force retrieval → reverse → interleave → space.
//
// This is the first knowledge type built end to end, and it is deliberately the least
// intellectually interesting one — which is exactly why it is a good first test of the
// architecture. There is nothing to explain about "lisinopril ↔ Zestril". The entire job is
// making the link produceable, in both directions, without it collapsing into its neighbours.
//
// 🔴 NO REVEAL. There is no "tap to see the answer", because recognition feels like knowing and
// is not: shown the answer, almost everyone thinks "yes, that one", and the retrieval that
// would have built the memory never happens. The learner produces something or explicitly
// surrenders. Surrendering is a first-class action — it is honest, it is better evidence than a
// peek, and it is recorded as a failed retrieval.
//
// 🔴 GROUPING IS A SCAFFOLD AND IS REMOVED. Items are shown in small related sets during first
// encoding to keep load down. The moment a pair has been produced correctly, grouping stops:
// left in place, the group heading becomes the answer. "Which ACE inhibitor is Zestril?" is
// trivially answerable when everything on screen is an ACE inhibitor, and the learner will
// answer from the heading without ever noticing they did.
//
// Everything here is pure. The drill is a function of the pairs and the attempt history.

import type { AssociationAttempt, AssociationDirection, AssociationPair } from "./knowledge-types";

/** Items shown together during first encoding. Small enough to hold at once; the brief says
 *  3-7 and the low end is safer, because the cost of too many is a learner who encodes none of
 *  them properly. */
export const MIN_GROUP = 3;
export const MAX_GROUP = 7;

/** Correct productions of one direction before that direction is considered learned for now. */
const LEARNED_AT = 1;

/** How many other pairs must be asked before the same pair may come round again. Spacing inside
 *  a session: asking the same item twice in a row measures short-term memory and nothing else. */
const MIN_GAP = 2;

/** Answering pair A with pair B's answer this many times is a confusion, not a slip. One is
 *  noise — people mistype and misremember once. Two is a pattern worth interrupting the drill
 *  for. */
export const CONFUSION_AT = 2;

/** Normalise a produced answer for comparison.
 *
 *  🔴 Generous on purpose, and only in ways that cannot change what was meant: case, outer
 *  whitespace, surrounding punctuation. It does NOT do fuzzy or edit-distance matching — for
 *  arbitrary mappings the exact form usually IS the knowledge, and marking "Zestril" and
 *  "Zestrid" the same would hide precisely the error worth catching. */
export function normalise(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?"'()[\]]/g, "")
    .replace(/\s+/g, " ");
}

export function isCorrect(said: string, expected: string): boolean {
  return normalise(said) === normalise(expected) && normalise(said).length > 0;
}

/** What the learner is shown when the cue is `direction`. */
export function cueFor(pair: AssociationPair, direction: AssociationDirection): string {
  return direction === "forward" ? pair.left : pair.right;
}

export function answerFor(pair: AssociationPair, direction: AssociationDirection): string {
  return direction === "forward" ? pair.right : pair.left;
}

/** Split pairs into encoding groups, respecting their own grouping where they have one.
 *
 *  Related items are introduced together because that is what makes the set learnable at all —
 *  but a group larger than MAX_GROUP is split rather than shown whole. */
export function encodingGroups(pairs: readonly AssociationPair[]): AssociationPair[][] {
  const byLabel = new Map<string, AssociationPair[]>();
  for (const pair of pairs) {
    const key = pair.groupLabel ?? "";
    byLabel.set(key, [...(byLabel.get(key) ?? []), pair]);
  }

  const groups: AssociationPair[][] = [];
  for (const members of byLabel.values()) {
    // 🔴 SPLIT EVENLY, DO NOT FOLD. Two rules are in play — never show more than MAX_GROUP at
    // once, and never show a lone item — and folding a remainder back satisfies the second by
    // breaking the first: nine items became 7 + fold = one group of nine. Choosing the number
    // of groups first and dividing evenly satisfies both, because nine is 5 + 4 rather than
    // 7 + 2.
    //
    // Splitting is also scoped to THIS label. An earlier version folded a short group into
    // whatever came last, which merged a two-item category into the previous, unrelated one —
    // three ACE inhibitors and two ARBs came out as one set of five. That destroys the only
    // thing grouping is for: items shown together must be genuinely related, or the contrast
    // the learner draws between them is a false one.
    const count = Math.max(1, Math.ceil(members.length / MAX_GROUP));
    const base = Math.floor(members.length / count);
    const extra = members.length % count;

    let cursor = 0;
    for (let index = 0; index < count; index += 1) {
      const size = base + (index < extra ? 1 : 0);
      groups.push(members.slice(cursor, cursor + size));
      cursor += size;
    }
  }
  return groups;
}

/** Stable identity for an encoding group, so "the learner has read this set" can be recorded
 *  and survive a reload. Sorted, because the group's identity is its membership and not the
 *  order the extractor happened to emit. */
export function groupKey(group: readonly AssociationPair[]): string {
  return [...group.map((pair) => pair.id)].sort().join("|");
}

// ------------------------------------------------------------------ progress

interface DirectionState {
  correct: number;
  attempts: number;
  lastIndex: number;
}

/** Per pair and direction: how it has gone, and when it was last asked. */
function progressOf(attempts: readonly AssociationAttempt[]): Map<string, DirectionState> {
  const state = new Map<string, DirectionState>();
  attempts.forEach((attempt, index) => {
    const key = `${attempt.pairId}:${attempt.direction}`;
    const current = state.get(key) ?? { correct: 0, attempts: 0, lastIndex: -1 };
    state.set(key, {
      correct: current.correct + (attempt.correct ? 1 : 0),
      attempts: current.attempts + 1,
      lastIndex: index,
    });
  });
  return state;
}

/** Has this pair been produced correctly in this direction? */
export function isLearned(
  attempts: readonly AssociationAttempt[],
  pairId: string,
  direction: AssociationDirection,
): boolean {
  return (progressOf(attempts).get(`${pairId}:${direction}`)?.correct ?? 0) >= LEARNED_AT;
}

/** Initial learning is over once every pair has been produced forward at least once. Until
 *  then the drill stays grouped; afterwards it interleaves and starts asking in reverse. */
export function initialLearningComplete(
  pairs: readonly AssociationPair[],
  attempts: readonly AssociationAttempt[],
): boolean {
  return pairs.length > 0 && pairs.every((pair) => isLearned(attempts, pair.id, "forward"));
}

// ---------------------------------------------------------------- confusions

export interface Confusion {
  /** The pair that was asked. */
  askedPairId: string;
  /** The pair whose answer they gave instead. */
  mistakenForPairId: string;
  count: number;
}

/** Find pairs the learner is systematically swapping.
 *
 *  🔴 THE MECHANISM THIS WHOLE FILE EXISTS FOR. A wrong answer is nearly useless on its own. A
 *  wrong answer that is EXACTLY ANOTHER ITEM'S ANSWER is a precise diagnosis: they have not
 *  failed to learn losartan, they have bound it to the wrong partner. That is repaired by
 *  contrasting the two directly, and it is invisible to any system that stored only right/wrong.
 *
 *  Deliberately only counts answers that match another pair in the SAME set — a stray wrong
 *  answer that happens to be some unrelated word is a slip, not a confusion. */
export function detectConfusions(
  pairs: readonly AssociationPair[],
  attempts: readonly AssociationAttempt[],
): Confusion[] {
  const counts = new Map<string, Confusion>();

  for (const attempt of attempts) {
    // Giving up tells us nothing about what they mixed it up WITH.
    if (attempt.correct || attempt.admitted) continue;
    const said = normalise(attempt.said);
    if (!said) continue;

    for (const other of pairs) {
      if (other.id === attempt.pairId) continue;
      // Did they produce the other pair's answer for THIS direction? Checking both sides of the
      // other pair, because a reversed binding shows up whichever way round it is asked.
      const matches =
        normalise(answerFor(other, attempt.direction)) === said ||
        normalise(other.left) === said ||
        normalise(other.right) === said;
      if (!matches) continue;

      const key = `${attempt.pairId}->${other.id}`;
      const existing = counts.get(key);
      counts.set(key, {
        askedPairId: attempt.pairId,
        mistakenForPairId: other.id,
        count: (existing?.count ?? 0) + 1,
      });
      break;
    }
  }

  return [...counts.values()].filter((entry) => entry.count >= CONFUSION_AT).sort((a, b) => b.count - a.count);
}

// -------------------------------------------------------------------- what next

export interface DrillStep {
  kind:
    /** Show a small related set to read before anything is asked. */
    | "encode"
    /** Produce the answer. The ordinary step. */
    | "retrieve"
    /** Two confused items placed side by side, then both tested immediately. */
    | "contrast";
  /** For "encode" and "contrast": the items involved. For "retrieve": the single pair. */
  pairs: AssociationPair[];
  direction: AssociationDirection;
  /** Set on "contrast", naming what is being untangled. */
  confusion?: Confusion;
  /** Whether the group heading may be shown. False once initial learning is done — the scaffold
   *  comes away, or the heading answers the question. */
  grouped: boolean;
}

/** The next thing to put in front of the learner, or null when there is nothing left to do.
 *
 *  Order of business:
 *    1. a confusion, if one has appeared — it will only get worse with more interleaving
 *    2. encode any group that has never been shown
 *    3. retrieve forward, spaced, while initial learning is in progress
 *    4. retrieve in both directions, interleaved, once it is not
 */
export function nextDrillStep(
  pairs: readonly AssociationPair[],
  attempts: readonly AssociationAttempt[],
  /** Groups the learner has already read, by `groupKey`.
   *
   *  🔴 Reading has to be recorded, and it cannot be inferred. The first version decided a group
   *  needed encoding whenever none of its pairs had an attempt yet — which is true before the
   *  learner reads it and still true immediately afterwards, so the drill showed the same set
   *  forever and never asked anything. Encoding is a real event with no answer attached, so it
   *  needs its own record. */
  encodedGroups: readonly string[] = [],
): DrillStep | null {
  if (pairs.length === 0) return null;

  const byId = new Map(pairs.map((pair) => [pair.id, pair]));
  const progress = progressOf(attempts);
  const initialDone = initialLearningComplete(pairs, attempts);

  // 1. Untangle a confusion before doing anything else.
  for (const confusion of detectConfusions(pairs, attempts)) {
    const asked = byId.get(confusion.askedPairId);
    const other = byId.get(confusion.mistakenForPairId);
    if (!asked || !other) continue;
    // Only if it has not already been contrasted since the last time it happened — otherwise
    // the drill would show the same contrast forever.
    const lastConfusedAt = attempts.reduce(
      (latest, attempt, index) =>
        attempt.pairId === confusion.askedPairId && !attempt.correct ? index : latest,
      -1,
    );
    const contrastedSince = attempts.some(
      (attempt, index) =>
        index > lastConfusedAt && attempt.pairId === confusion.mistakenForPairId && attempt.correct,
    );
    if (contrastedSince) continue;
    return { kind: "contrast", pairs: [asked, other], direction: "forward", confusion, grouped: false };
  }

  // 2. Anything never shown gets encoded first, in its group.
  const seen = new Set(encodedGroups);
  for (const group of encodingGroups(pairs)) {
    if (seen.has(groupKey(group))) continue;
    const untouched = group.every(
      (pair) => !progress.has(`${pair.id}:forward`) && !progress.has(`${pair.id}:backward`),
    );
    if (untouched) return { kind: "encode", pairs: group, direction: "forward", grouped: true };
  }

  // 3 & 4. Pick what to retrieve. Candidates are every pair × every direction that is not yet
  // learned — restricted to forward while initial learning is still going.
  const directions: AssociationDirection[] = initialDone ? ["forward", "backward"] : ["forward"];
  type Candidate = { pair: AssociationPair; direction: AssociationDirection; lastIndex: number };
  const candidates: Candidate[] = [];

  for (const pair of pairs) {
    for (const direction of directions) {
      const state = progress.get(`${pair.id}:${direction}`);
      if ((state?.correct ?? 0) >= LEARNED_AT) continue;
      candidates.push({ pair, direction, lastIndex: state?.lastIndex ?? -1 });
    }
  }
  if (candidates.length === 0) return null;

  // Spacing: prefer something that has not been asked recently. If everything is recent (a
  // very small set), take the least recent rather than refusing to ask anything.
  const boundary = attempts.length - MIN_GAP;
  const spaced = candidates.filter((candidate) => candidate.lastIndex < boundary);
  const pool = spaced.length > 0 ? spaced : candidates;
  const chosen = pool.reduce((best, candidate) => (candidate.lastIndex < best.lastIndex ? candidate : best));

  return {
    kind: "retrieve",
    pairs: [chosen.pair],
    direction: chosen.direction,
    // 🔴 The scaffold comes away once initial learning is done. Leaving it would let the
    // heading answer the question.
    grouped: !initialDone,
  };
}

/** Everything still unlearned, for a progress read that is a count and not a percentage. */
export function remainingCount(
  pairs: readonly AssociationPair[],
  attempts: readonly AssociationAttempt[],
): number {
  const initialDone = initialLearningComplete(pairs, attempts);
  const directions: AssociationDirection[] = initialDone ? ["forward", "backward"] : ["forward"];
  return pairs.reduce(
    (total, pair) =>
      total + directions.filter((direction) => !isLearned(attempts, pair.id, direction)).length,
    0,
  );
}
