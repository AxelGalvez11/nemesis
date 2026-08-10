import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONFUSION_AT,
  detectConfusions,
  encodingGroups,
  initialLearningComplete,
  isCorrect,
  nextDrillStep,
  normalise,
  remainingCount,
} from "./association-drill";
import type { AssociationAttempt, AssociationDirection, AssociationPair } from "./knowledge-types";

/** Deliberately mixed fields — the drill must not care what the subject is. */
const ACE: AssociationPair[] = [
  { id: "p1", left: "lisinopril", right: "Zestril", groupLabel: "ACE inhibitors" },
  { id: "p2", left: "enalapril", right: "Vasotec", groupLabel: "ACE inhibitors" },
  { id: "p3", left: "benazepril", right: "Lotensin", groupLabel: "ACE inhibitors" },
];

const ARB: AssociationPair[] = [
  { id: "p4", left: "losartan", right: "Cozaar", groupLabel: "ARBs" },
  { id: "p5", left: "valsartan", right: "Diovan", groupLabel: "ARBs" },
];

const ALL = [...ACE, ...ARB];

let clock = 0;
function attempt(
  pairId: string,
  said: string,
  correct: boolean,
  direction: AssociationDirection = "forward",
  admitted = false,
): AssociationAttempt {
  clock += 1;
  return { pairId, said, correct, direction, admitted, at: `2026-08-10T00:00:${String(clock).padStart(2, "0")}.000Z` };
}

test("matching is generous about form and strict about content", () => {
  assert.ok(isCorrect("  Zestril ", "Zestril"));
  assert.ok(isCorrect("zestril.", "Zestril"));
  assert.ok(isCorrect("der Tisch", "Der Tisch"));
  // 🔴 No fuzzy matching. For an arbitrary mapping the exact form IS the knowledge, and
  // accepting a near-miss hides the one error most worth catching.
  assert.ok(!isCorrect("Zestrid", "Zestril"));
  assert.ok(!isCorrect("", "Zestril"));
  assert.equal(normalise("  A,  B! "), "a b");
});

test("related items are introduced together, and oversized groups are split", () => {
  const groups = encodingGroups(ALL);
  assert.equal(groups.length, 2, "two labels, two groups");
  assert.deepEqual(groups[0]!.map((p) => p.id), ["p1", "p2", "p3"]);
  assert.deepEqual(groups[1]!.map((p) => p.id), ["p4", "p5"]);

  const many: AssociationPair[] = Array.from({ length: 9 }, (_, i) => ({
    id: `x${i}`,
    left: `l${i}`,
    right: `r${i}`,
    groupLabel: "big",
  }));
  const split = encodingGroups(many);
  assert.ok(split.every((group) => group.length <= 7), "never more than seven at once");
  assert.equal(split.flat().length, 9, "and nothing is dropped");
});

test("🔴 groups are split evenly, never leaving a lone item or an oversized set", () => {
  // Two rules are in tension: never more than seven at once, never one item alone. Folding a
  // remainder back satisfies the second by breaking the first — nine items became a group of
  // nine. Dividing evenly satisfies both.
  for (const total of [8, 9, 13, 15, 22]) {
    const items: AssociationPair[] = Array.from({ length: total }, (_, i) => ({
      id: `y${i}`,
      left: `l${i}`,
      right: `r${i}`,
      groupLabel: "one-label",
    }));
    const groups = encodingGroups(items);
    assert.equal(groups.flat().length, total, `${total}: nothing dropped or duplicated`);
    for (const group of groups) {
      assert.ok(group.length <= 7, `${total}: a group of ${group.length} is too many at once`);
      assert.ok(group.length >= 3, `${total}: a group of ${group.length} is too few to contrast`);
    }
  }
});

test("a category smaller than a group is still its own category", () => {
  // Two items under one label stay together and stay separate from everything else. The
  // minimum is a target for splitting a large set, not a reason to merge unrelated ones.
  const groups = encodingGroups(ARB);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0]!.map((p) => p.id), ["p4", "p5"]);
});

test("the drill encodes before it asks", () => {
  const step = nextDrillStep(ALL, []);
  assert.equal(step?.kind, "encode");
  assert.equal(step?.pairs.length, 3, "the first group, not the whole set");
  assert.equal(step?.grouped, true);
});

test("🔴 the group heading is withdrawn once initial learning is done", () => {
  // While learning, the scaffold is allowed.
  const early = nextDrillStep(ALL, [attempt("p1", "Zestril", true)]);
  assert.equal(early?.grouped, true);

  // Every pair produced once forward: initial learning is over.
  const learned = ALL.map((pair) => attempt(pair.id, pair.right, true));
  assert.ok(initialLearningComplete(ALL, learned));
  const later = nextDrillStep(ALL, learned);
  // 🔴 If the heading stayed, "which ARB is Diovan?" is answerable from the heading alone and
  // the learner never notices they did not retrieve it.
  assert.equal(later?.grouped, false);
});

test("both directions are tested, and only after initial learning", () => {
  const forwardOnly = ALL.map((pair) => attempt(pair.id, pair.right, true));
  // Before: every step is forward.
  const during = nextDrillStep(ALL, [attempt("p1", "Zestril", true)]);
  assert.equal(during?.direction, "forward");

  // After: backward becomes available, and is what is left to do.
  const step = nextDrillStep(ALL, forwardOnly);
  assert.equal(step?.direction, "backward", "knowing one direction is not knowing the other");
});

test("the same item is not asked twice in a row", () => {
  const attempts = [attempt("p1", "wrong", false), attempt("p2", "Vasotec", true), attempt("p3", "Lotensin", true)];
  const step = nextDrillStep(ACE, attempts);
  assert.equal(step?.kind, "retrieve");
  // p1 is unlearned but was asked three attempts ago; p2/p3 are learned. With spacing it is
  // fine to come back to p1 now — what must not happen is asking it immediately after itself.
  const immediate = nextDrillStep(ACE, [attempt("p1", "wrong", false)]);
  assert.notEqual(immediate?.pairs[0]?.id, "p1", "asking again at once measures short-term memory");
});

test("🔴 answering with ANOTHER item's answer is detected as a confusion", () => {
  // The mechanism the whole file exists for: they have not failed to learn losartan, they have
  // bound it to the wrong partner. Invisible to anything that stored only right/wrong.
  const attempts = [
    attempt("p4", "Diovan", false),
    attempt("p4", "Diovan", false),
  ];
  const found = detectConfusions(ALL, attempts);
  assert.equal(found.length, 1);
  assert.equal(found[0]!.askedPairId, "p4");
  assert.equal(found[0]!.mistakenForPairId, "p5", "losartan is being confused with valsartan");
  assert.equal(found[0]!.count, 2);
});

test("one wrong answer is a slip, not a confusion", () => {
  assert.equal(detectConfusions(ALL, [attempt("p4", "Diovan", false)]).length, 0);
  assert.equal(CONFUSION_AT, 2, "the threshold is a stated policy, not an accident");
});

test("a wrong answer that is not another item's answer is not a confusion", () => {
  const attempts = [attempt("p4", "banana", false), attempt("p4", "banana", false)];
  assert.deepEqual(detectConfusions(ALL, attempts), [], "a slip is not a systematic swap");
});

test("giving up is recorded but never counted as a confusion", () => {
  // Surrendering is honest and tells us nothing about what they mixed it up WITH.
  const attempts = [
    attempt("p4", "Diovan", false, "forward", true),
    attempt("p4", "Diovan", false, "forward", true),
  ];
  assert.deepEqual(detectConfusions(ALL, attempts), []);
});

test("🔴 a confusion interrupts the drill and contrasts the two items", () => {
  const attempts = [attempt("p4", "Diovan", false), attempt("p4", "Diovan", false)];
  const step = nextDrillStep(ALL, attempts);
  assert.equal(step?.kind, "contrast");
  assert.deepEqual(step?.pairs.map((p) => p.id).sort(), ["p4", "p5"]);
  assert.equal(step?.confusion?.mistakenForPairId, "p5");
  // Contrasting means showing them together — the grouping scaffold is irrelevant here.
  assert.equal(step?.grouped, false);
});

test("the contrast is not shown forever once it has been resolved", () => {
  const attempts = [
    attempt("p4", "Diovan", false),
    attempt("p4", "Diovan", false),
    // The contrast happened and the other item was then produced correctly.
    attempt("p5", "Diovan", true),
  ];
  const step = nextDrillStep(ALL, attempts);
  assert.notEqual(step?.kind, "contrast", "resolved confusions must stop interrupting");
});

test("the drill ends when everything is learned in both directions", () => {
  const done: AssociationAttempt[] = [];
  for (const pair of ACE) done.push(attempt(pair.id, pair.right, true, "forward"));
  for (const pair of ACE) done.push(attempt(pair.id, pair.left, true, "backward"));
  assert.equal(nextDrillStep(ACE, done), null);
  assert.equal(remainingCount(ACE, done), 0);
});

test("remaining is a count of work, never a percentage", () => {
  assert.equal(remainingCount(ACE, []), 3, "forward only, while initial learning is in progress");
  const forward = ACE.map((pair) => attempt(pair.id, pair.right, true));
  assert.equal(remainingCount(ACE, forward), 3, "…then the three backward directions open up");
});

test("an empty set has nothing to do rather than crashing", () => {
  assert.equal(nextDrillStep([], []), null);
  assert.equal(initialLearningComplete([], []), false);
  assert.deepEqual(encodingGroups([]), []);
});
