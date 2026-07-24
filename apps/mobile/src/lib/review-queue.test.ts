import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyGrade,
  EMPTY_PROGRESS,
  NEW_STEPS,
  isDue,
  revertTo,
  sessionCounts,
  sessionQueue,
  shouldEmitGrade,
  type QueueCard,
  type SessionProgress,
} from "./review-queue.ts";

const NOW = new Date("2026-07-23T18:00:00.000Z");
const YESTERDAY = "2026-07-22T18:00:00.000Z";
const TOMORROW = "2026-07-24T18:00:00.000Z";

const card = (over: Partial<QueueCard> & Pick<QueueCard, "id">): QueueCard => ({
  repetitions: 0,
  intervalDays: 0,
  dueAt: YESTERDAY,
  suspended: false,
  ...over,
});

Deno.test("isDue: past due dates count, future ones don't", () => {
  assertEquals(isDue(card({ id: "a", dueAt: YESTERDAY }), NOW), true);
  assertEquals(isDue(card({ id: "b", dueAt: TOMORROW }), NOW), false);
});

Deno.test("isDue: a suspended card is never due, even if its date has passed", () => {
  assertEquals(isDue(card({ id: "a", dueAt: YESTERDAY, suspended: true }), NOW), false);
});

Deno.test("isDue: an unparseable date is treated as due rather than swallowed", () => {
  assertEquals(isDue(card({ id: "a", dueAt: "not a date" }), NOW), true);
});


const progress = (over: Partial<SessionProgress> = {}): SessionProgress => ({ ...EMPTY_PROGRESS, ...over });
/** A card as applyGrade needs to see it. */
const seen = (id: string, repetitions = 0) => ({ id, repetitions });

Deno.test("sessionQueue: only due, unfinished cards, in their original order", () => {
  const cards = [card({ id: "a" }), card({ id: "b", dueAt: TOMORROW }), card({ id: "c" })];
  const queue = sessionQueue(cards, progress({ doneIds: ["c"] }), NOW);
  assertEquals(queue.map((c) => c.id), ["a"]);
});

Deno.test("sessionQueue: a card still in its steps returns at the BACK, not as the next card", () => {
  const cards = [card({ id: "a" }), card({ id: "b" }), card({ id: "c" })];
  // "a" was graded: the server pushed its due date out, but the sitting still
  // owes the student another look at it.
  const cards2 = cards.map((c) => (c.id === "a" ? { ...c, dueAt: TOMORROW, repetitions: 1, intervalDays: 1 } : c));
  const queue = sessionQueue(cards2, progress({ learning: [{ id: "a", steps: 1, stepsLeft: 1 }] }), NOW);
  assertEquals(queue.map((c) => c.id), ["b", "c", "a"]);
});

Deno.test("sessionQueue: learning cards keep the order they were sent back in", () => {
  const cards = [card({ id: "a", dueAt: TOMORROW }), card({ id: "b", dueAt: TOMORROW }), card({ id: "c" })];
  const queue = sessionQueue(
    cards,
    progress({ learning: [{ id: "b", steps: 1, stepsLeft: 1 }, { id: "a", steps: 1, stepsLeft: 1 }] }),
    NOW,
  );
  assertEquals(queue.map((c) => c.id), ["c", "b", "a"]);
});

Deno.test("sessionQueue: a graduated card is gone for good", () => {
  const cards = [card({ id: "a", dueAt: TOMORROW })];
  assertEquals(sessionQueue(cards, progress({ doneIds: ["a"] }), NOW).length, 0);
});

// --- the owner's actual complaint, twice over -------------------------------

Deno.test("a new card takes TWO goods to graduate, and comes back in between", () => {
  // Owner 2026-07-24: "review should keep showing cards until they have been
  // mastered like in anki". One press used to retire a card the student had
  // seen exactly once.
  const cards = [card({ id: "a" }), card({ id: "b" })];
  let p = EMPTY_PROGRESS;

  p = applyGrade(p, seen("a"), "good");
  assertEquals(sessionQueue(cards, p, NOW).map((c) => c.id), ["b", "a"], "still owed another look at a");
  assertEquals(p.doneIds, []);

  p = applyGrade(p, seen("a", 1), "good");
  assertEquals(p.doneIds, ["a"]);
  assertEquals(sessionQueue(cards, p, NOW).map((c) => c.id), ["b"]);
});

Deno.test("passing a new card moves it New -> Learn, and graduating moves Learn -> gone", () => {
  // This is the counter complaint itself. Before, on an all-new deck, New was
  // the only number that could ever change.
  const cards = [card({ id: "a" }), card({ id: "b" })];
  assertEquals(sessionCounts(sessionQueue(cards, EMPTY_PROGRESS, NOW), EMPTY_PROGRESS), { fresh: 2, learn: 0, due: 0 });

  const once = applyGrade(EMPTY_PROGRESS, seen("a"), "good");
  // The server bumped repetitions and pushed the due date out; the sitting
  // still shows the card, and it now reads as Learn.
  const graded = cards.map((c) => (c.id === "a" ? { ...c, dueAt: TOMORROW, repetitions: 1, intervalDays: 1 } : c));
  assertEquals(sessionCounts(sessionQueue(graded, once, NOW), once), { fresh: 1, learn: 1, due: 0 });

  const twice = applyGrade(once, seen("a", 1), "good");
  assertEquals(sessionCounts(sessionQueue(graded, twice, NOW), twice), { fresh: 1, learn: 0, due: 0 });
});

Deno.test("failing a NEW card restarts the full ladder, even after the server bumped repetitions", () => {
  // The row's `repetitions` is 1 from the first press onward (the server bumps
  // it), so recomputing the ladder from the card would quietly demote a failed
  // NEW card to the one-step relearn ladder. The entry remembers which ladder
  // it started on instead — Anki restarts a failed new card from the top.
  const cards = [card({ id: "a" })];
  let p = EMPTY_PROGRESS;
  for (let i = 0; i < 5; i++) {
    p = applyGrade(p, seen("a", i === 0 ? 0 : 1), "again");
    assertEquals(sessionQueue(cards, p, NOW).map((c) => c.id), ["a"], `still owed after ${i + 1} failures`);
    assertEquals(p.learning, [{ id: "a", steps: 2, stepsLeft: 2 }]);
  }
  p = applyGrade(p, seen("a", 1), "good");
  assertEquals(p.doneIds, [], "one good after failing a new card is not mastery");
  p = applyGrade(p, seen("a", 1), "good");
  assertEquals(p.doneIds, ["a"]);
});

Deno.test("an established card that comes round again is done in one pass", () => {
  // A mature card is NOT a new card — Anki does not put it back through the
  // ladder just for being answered correctly.
  const p = applyGrade(EMPTY_PROGRESS, seen("a", 9), "good");
  assertEquals(p.doneIds, ["a"]);
  assertEquals(p.learning, []);
});

Deno.test("an established card that lapses relearns in a single step", () => {
  let p = applyGrade(EMPTY_PROGRESS, seen("a", 9), "again");
  assertEquals(p.learning, [{ id: "a", steps: 1, stepsLeft: 1 }]);
  p = applyGrade(p, seen("a", 10), "good");
  assertEquals(p.doneIds, ["a"]);
});

Deno.test("Easy graduates from anywhere; Hard repeats the step without advancing", () => {
  assertEquals(applyGrade(EMPTY_PROGRESS, seen("a"), "easy").doneIds, ["a"]);
  const mid = applyGrade(EMPTY_PROGRESS, seen("a"), "good");
  assertEquals(mid.learning, [{ id: "a", steps: 2, stepsLeft: 1 }]);
  const hard = applyGrade(mid, seen("a", 1), "hard");
  assertEquals(hard.learning, [{ id: "a", steps: 2, stepsLeft: 1 }], "Hard must not graduate the card");
  assertEquals(hard.doneIds, []);
  assertEquals(applyGrade(hard, seen("a", 1), "easy").doneIds, ["a"]);
});

// --- the RPC gate ----------------------------------------------------------

Deno.test("only the FIRST press of a card is ever sent to the server", () => {
  // grade_study_card applies every call as an independent review. A new card
  // now takes two or more presses to graduate, so sending each one would
  // advance its real interval two or three times for a single sitting and push
  // the card weeks out. This is the guard for that.
  let p = EMPTY_PROGRESS;
  let sent = 0;
  for (const grade of ["good", "again", "hard", "good", "good"] as const) {
    if (shouldEmitGrade(p, "a")) sent += 1;
    p = applyGrade(p, seen("a", sent > 1 ? 1 : 0), grade);
  }
  assertEquals(sent, 1, "five presses of one card must be exactly one server review");
});

Deno.test("each card gets its own single emission", () => {
  let p = EMPTY_PROGRESS;
  const sent: string[] = [];
  for (const id of ["a", "b", "a", "b", "c"]) {
    if (shouldEmitGrade(p, id)) sent.push(id);
    p = applyGrade(p, seen(id), "good");
  }
  assertEquals(sent, ["a", "b", "c"]);
});

Deno.test("undo rewinds the emission gate too, so a corrected grade is really re-sent", () => {
  // Undo is the honest way to fix a mis-tap (there is no ungrade RPC), so the
  // re-grade after an undo has to reach the server or the correction is lost.
  const before = EMPTY_PROGRESS;
  const after = applyGrade(before, seen("a"), "again");
  assertEquals(shouldEmitGrade(after, "a"), false);
  assertEquals(shouldEmitGrade(revertTo(before), "a"), true);
});

// --- counters --------------------------------------------------------------

Deno.test("sessionCounts: a mature card that has come round again counts as Due", () => {
  const cards = [card({ id: "a", repetitions: 9, intervalDays: 40 })];
  assertEquals(sessionCounts(sessionQueue(cards, EMPTY_PROGRESS, NOW), EMPTY_PROGRESS), { fresh: 0, learn: 0, due: 1 });
});

Deno.test("sessionCounts: an untouched YOUNG card counts as Due, not Learn", () => {
  // Anki's Learn column is "in learning steps right now", not "young". Filing
  // young cards under Learn is the other half of why these numbers looked
  // frozen: such a card sat in Learn from the first frame and never left.
  const cards = [card({ id: "a", repetitions: 2, intervalDays: 3 })];
  assertEquals(sessionCounts(sessionQueue(cards, EMPTY_PROGRESS, NOW), EMPTY_PROGRESS), { fresh: 0, learn: 0, due: 1 });
});

Deno.test("sessionCounts: being in the ladder outranks the card's own interval", () => {
  const cards = [card({ id: "a", repetitions: 9, intervalDays: 40, dueAt: TOMORROW })];
  const p = progress({ learning: [{ id: "a", steps: 1, stepsLeft: 1 }] });
  assertEquals(sessionCounts(sessionQueue(cards, p, NOW), p), { fresh: 0, learn: 1, due: 0 });
});

Deno.test("sessionCounts: the three numbers always sum to what's left", () => {
  const cards = [
    card({ id: "a" }),
    card({ id: "b", repetitions: 3, intervalDays: 2 }),
    card({ id: "c", repetitions: 9, intervalDays: 40 }),
  ];
  const queue = sessionQueue(cards, EMPTY_PROGRESS, NOW);
  const counts = sessionCounts(queue, EMPTY_PROGRESS);
  assertEquals(counts.fresh + counts.learn + counts.due, queue.length);
});

Deno.test("applyGrade: never mutates the progress it was handed", () => {
  const before = progress({ doneIds: ["x"], gradedIds: ["x"], learning: [{ id: "y", steps: 1, stepsLeft: 1 }] });
  applyGrade(before, seen("z"), "again");
  applyGrade(before, seen("z"), "good");
  assertEquals(before, progress({ doneIds: ["x"], gradedIds: ["x"], learning: [{ id: "y", steps: 1, stepsLeft: 1 }] }));
});

Deno.test("revertTo: restores an earlier sitting exactly, as a fresh object", () => {
  const before = progress({ doneIds: ["a"], gradedIds: ["a"], learning: [{ id: "b", steps: 1, stepsLeft: 1 }] });
  const after = applyGrade(before, seen("c", 9), "good");
  assertEquals(after.doneIds, ["a", "c"]);
  const undone = revertTo(before);
  assertEquals(undone, before);
  // A copy, so mutating the restored value can't reach back into the trail.
  assertEquals(undone.doneIds === before.doneIds, false);
  assertEquals(undone.learning[0] === before.learning[0], false);
});

Deno.test("Hard on a brand-new card does NOT do what Good does", () => {
  // The press where Hard is used most is the first one. Advancing the ladder
  // there made hard,good and good,good master a card in the same two looks.
  const fresh = card({ id: "a", repetitions: 0 });
  const hard = applyGrade(progress(), fresh, "hard");
  const good = applyGrade(progress(), fresh, "good");
  assertEquals(hard.learning[0].stepsLeft, NEW_STEPS, "Hard holds the ladder where it is");
  assertEquals(good.learning[0].stepsLeft, NEW_STEPS - 1, "Good advances it");
  assertEquals(hard.learning[0].stepsLeft === good.learning[0].stepsLeft, false);
});

Deno.test("Hard on an established review card still finishes it for the sitting", () => {
  // Anki shortens the next interval on Hard; it does not drop a mature card
  // back into learning steps.
  const mature = card({ id: "b", repetitions: 6, intervalDays: 30 });
  const after = applyGrade(progress(), mature, "hard");
  assertEquals(after.learning.length, 0);
  assertEquals(after.doneIds, ["b"]);
});
