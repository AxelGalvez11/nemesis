// Deno unit tests (repo convention) for the study-session pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/study-session.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AGAIN_GAP,
  applyGradeToQueue,
  chunkEvents,
  makeClientEventId,
  parseDeckSnapshot,
  partitionQueueByUser,
  pruneGradedMarks,
  removeByClientEventId,
  sessionQueue,
  type DeckQueueCard,
} from "./study-session.ts";

const card = (key: string): DeckQueueCard => ({ key, prompt: `P ${key}`, answer: `A ${key}`, isNew: false });

const snapshotJson = JSON.stringify({
  v: 1,
  asOf: "2026-07-17T06:00:00Z",
  id: "deck-1",
  name: "Cardio",
  course: "PHCY 1205",
  stats: { due: 2, fresh: 1, total: 40 },
  queue: [
    { key: "card-a", prompt: "Front", answer: "Back", isNew: true },
    { key: "card-b#c1", prompt: "____ blocks NKCC2", answer: "furosemide blocks NKCC2", note: "loop", isNew: false },
    { key: "", prompt: "bad", answer: "bad" },
    "garbage",
  ],
});

Deno.test("parseDeckSnapshot: validates the envelope and drops malformed queue entries", () => {
  const snapshot = parseDeckSnapshot(snapshotJson);
  assertEquals(snapshot?.id, "deck-1");
  assertEquals(snapshot?.course, "PHCY 1205");
  assertEquals(snapshot?.stats, { due: 2, fresh: 1, total: 40 });
  assertEquals(snapshot?.queue.length, 2);
  assertEquals(snapshot?.queue[1].note, "loop");
  assertEquals(parseDeckSnapshot("not json"), null);
  assertEquals(parseDeckSnapshot('{"v":2,"id":"x","name":"y"}'), null);
});

Deno.test("pruneGradedMarks: marks older than the snapshot retire, newer ones survive", () => {
  const marks = [
    { key: "old", at: "2026-07-17T05:00:00Z" },
    { key: "new", at: "2026-07-17T07:00:00Z" },
  ];
  assertEquals(pruneGradedMarks(marks, "2026-07-17T06:00:00Z"), [{ key: "new", at: "2026-07-17T07:00:00Z" }]);
});

Deno.test("pruneGradedMarks: a timestamp TIE keeps the mark (same-ms snapshot can't include it)", () => {
  const marks = [{ key: "tie", at: "2026-07-17T06:00:00Z" }];
  assertEquals(pruneGradedMarks(marks, "2026-07-17T06:00:00Z"), marks);
});

Deno.test("partitionQueueByUser: own events flush, other accounts' events stay parked", () => {
  const events = [
    { client_event_id: "1", user_id: "alice" },
    { client_event_id: "2", user_id: "bob" },
    { client_event_id: "3", user_id: "alice" },
  ];
  const { own, others } = partitionQueueByUser(events, "alice");
  assertEquals(own.map((e) => e.client_event_id), ["1", "3"]);
  assertEquals(others.map((e) => e.client_event_id), ["2"]);
});

Deno.test("removeByClientEventId: removes exactly the confirmed ids", () => {
  const events = [{ client_event_id: "1" }, { client_event_id: "2" }, { client_event_id: "3" }];
  assertEquals(
    removeByClientEventId(events, new Set(["1", "3"])).map((e) => e.client_event_id),
    ["2"],
  );
});

Deno.test("sessionQueue: hides cards graded on this phone since the snapshot", () => {
  const snapshot = parseDeckSnapshot(snapshotJson)!;
  const queue = sessionQueue(snapshot, [
    { key: "card-a", at: "2026-07-17T07:00:00Z" }, // after asOf → hidden
    { key: "card-b#c1", at: "2026-07-17T05:00:00Z" }, // before asOf → retired mark
  ]);
  assertEquals(queue.map((entry) => entry.key), ["card-b#c1"]);
});

Deno.test("applyGradeToQueue: non-again grades complete the card; again re-queues it a few back", () => {
  const queue = [card("a"), card("b"), card("c"), card("d"), card("e")];

  const good = applyGradeToQueue(queue, "good");
  assertEquals(good.completed, true);
  assertEquals(good.queue.map((entry) => entry.key), ["b", "c", "d", "e"]);

  const again = applyGradeToQueue(queue, "again");
  assertEquals(again.completed, false);
  assertEquals(again.queue.map((entry) => entry.key), ["b", "c", "d", "a", "e"]);
  assertEquals(again.queue.length, queue.length);
  assertEquals(AGAIN_GAP, 3);
});

Deno.test("applyGradeToQueue: again on a short queue lands the card at the end", () => {
  const again = applyGradeToQueue([card("a"), card("b")], "again");
  assertEquals(again.queue.map((entry) => entry.key), ["b", "a"]);
  const solo = applyGradeToQueue([card("a")], "again");
  assertEquals(solo.queue.map((entry) => entry.key), ["a"]);
});

Deno.test("makeClientEventId: uuid-v4 shape, deterministic under injected randomness", () => {
  let calls = 0;
  const rand = () => {
    calls++;
    return 0.5;
  };
  const id = makeClientEventId(rand);
  assertEquals(id.length, 36);
  assertEquals(id[14], "4");
  assertEquals(["8", "9", "a", "b"].includes(id[19]), true);
  assertEquals(/^[0-9a-f-]{36}$/.test(id), true);
  assertEquals(calls > 0, true);
});

Deno.test("chunkEvents: splits into fixed-size batches", () => {
  assertEquals(chunkEvents([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assertEquals(chunkEvents([], 2), []);
});
