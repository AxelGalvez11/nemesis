import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyGrade,
  EMPTY_PROGRESS,
  isDue,
  revertTo,
  sessionCounts,
  sessionQueue,
  type QueueCard,
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

Deno.test("sessionQueue: only due, unfinished cards, in their original order", () => {
  const cards = [card({ id: "a" }), card({ id: "b", dueAt: TOMORROW }), card({ id: "c" })];
  const queue = sessionQueue(cards, { doneIds: ["c"], relearnIds: [] }, NOW);
  assertEquals(queue.map((c) => c.id), ["a"]);
});

Deno.test("sessionQueue: an 'Again' card returns at the BACK, not as the next card", () => {
  const cards = [card({ id: "a" }), card({ id: "b" }), card({ id: "c" })];
  // "a" was failed: the server pushed its due date out a day, but the sitting
  // still owes the student one more look at it.
  const cards2 = cards.map((c) => (c.id === "a" ? { ...c, dueAt: TOMORROW, repetitions: 1, intervalDays: 1 } : c));
  const queue = sessionQueue(cards2, { doneIds: [], relearnIds: ["a"] }, NOW);
  assertEquals(queue.map((c) => c.id), ["b", "c", "a"]);
});

Deno.test("sessionQueue: replayed cards keep the order they were failed in", () => {
  const cards = [card({ id: "a", dueAt: TOMORROW }), card({ id: "b", dueAt: TOMORROW }), card({ id: "c" })];
  const queue = sessionQueue(cards, { doneIds: [], relearnIds: ["b", "a"] }, NOW);
  assertEquals(queue.map((c) => c.id), ["c", "b", "a"]);
});

Deno.test("sessionQueue: finishing a replayed card removes it for good", () => {
  const cards = [card({ id: "a", dueAt: TOMORROW })];
  const queue = sessionQueue(cards, { doneIds: ["a"], relearnIds: [] }, NOW);
  assertEquals(queue.length, 0);
});

Deno.test("sessionCounts: a freshly imported deck is all New", () => {
  const cards = [card({ id: "a" }), card({ id: "b" })];
  const queue = sessionQueue(cards, EMPTY_PROGRESS, NOW);
  assertEquals(sessionCounts(queue, EMPTY_PROGRESS), { fresh: 2, learn: 0, due: 0 });
});

Deno.test("sessionCounts: pressing Again moves a card from New to Learn — the bug this fixes", () => {
  const cards = [card({ id: "a" }), card({ id: "b" })];
  // Before: 2 New, 0 Learn.
  assertEquals(sessionCounts(sessionQueue(cards, EMPTY_PROGRESS, NOW), EMPTY_PROGRESS), {
    fresh: 2,
    learn: 0,
    due: 0,
  });
  // "a" is failed — the server bumps repetitions and pushes the due date out.
  const after = applyGrade(EMPTY_PROGRESS, "a", true);
  const graded = cards.map((c) => (c.id === "a" ? { ...c, dueAt: TOMORROW, repetitions: 1, intervalDays: 1 } : c));
  assertEquals(sessionCounts(sessionQueue(graded, after, NOW), after), { fresh: 1, learn: 1, due: 0 });
});

Deno.test("sessionCounts: a mature card that has come round again counts as Due", () => {
  const cards = [card({ id: "a", repetitions: 9, intervalDays: 40 })];
  const queue = sessionQueue(cards, EMPTY_PROGRESS, NOW);
  assertEquals(sessionCounts(queue, EMPTY_PROGRESS), { fresh: 0, learn: 0, due: 1 });
});

Deno.test("sessionCounts: a young established card counts as Learn", () => {
  const cards = [card({ id: "a", repetitions: 2, intervalDays: 3 })];
  const queue = sessionQueue(cards, EMPTY_PROGRESS, NOW);
  assertEquals(sessionCounts(queue, EMPTY_PROGRESS), { fresh: 0, learn: 1, due: 0 });
});

Deno.test("sessionCounts: replaying outranks the card's own interval", () => {
  // The server bumped this to a 40-day interval, but the student just said they
  // had forgotten it — it must not read as established.
  const cards = [card({ id: "a", repetitions: 9, intervalDays: 40, dueAt: TOMORROW })];
  const progress = { doneIds: [], relearnIds: ["a"] };
  assertEquals(sessionCounts(sessionQueue(cards, progress, NOW), progress), { fresh: 0, learn: 1, due: 0 });
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

Deno.test("applyGrade: Again queues a replay, anything else finishes the card", () => {
  assertEquals(applyGrade(EMPTY_PROGRESS, "a", true), { doneIds: [], relearnIds: ["a"] });
  assertEquals(applyGrade(EMPTY_PROGRESS, "a", false), { doneIds: ["a"], relearnIds: [] });
});

Deno.test("applyGrade: failing a replayed card sends it to the back again, not twice", () => {
  const once = applyGrade(EMPTY_PROGRESS, "a", true);
  const twice = applyGrade(applyGrade(once, "b", true), "a", true);
  assertEquals(twice.relearnIds, ["b", "a"]);
});

Deno.test("applyGrade: finally passing a replayed card clears it from the replay list", () => {
  const failed = applyGrade(EMPTY_PROGRESS, "a", true);
  const passed = applyGrade(failed, "a", false);
  assertEquals(passed, { doneIds: ["a"], relearnIds: [] });
});

Deno.test("applyGrade: never mutates the progress it was handed", () => {
  const before = { doneIds: ["x"], relearnIds: ["y"] };
  applyGrade(before, "z", true);
  applyGrade(before, "z", false);
  assertEquals(before, { doneIds: ["x"], relearnIds: ["y"] });
});

Deno.test("revertTo: restores an earlier sitting exactly, as a fresh object", () => {
  const before = { doneIds: ["a"], relearnIds: ["b"] };
  const after = applyGrade(before, "c", false);
  assertEquals(after.doneIds, ["a", "c"]);
  const undone = revertTo(before);
  assertEquals(undone, { doneIds: ["a"], relearnIds: ["b"] });
  // A copy, so mutating the restored value can't reach back into the trail.
  assertEquals(undone.doneIds === before.doneIds, false);
});
