// Deno unit tests (repo convention) for the study-session pure helpers.
// Run: deno test --no-check apps/mobile/src/lib/study-session.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  chunkEvents,
  clozeAnswerHighlight,
  clozeParts,
  gradeCurrent,
  initSession,
  LEARNING_GAP,
  makeClientEventId,
  NEW_STEPS,
  parseDeckSnapshot,
  partitionQueueByUser,
  pruneGradedMarks,
  removeByClientEventId,
  RELEARN_STEPS,
  sessionCounts,
  sessionQueue,
  splitStrayField,
  type DeckQueueCard,
} from "./study-session.ts";

const card = (key: string, isNew = false): DeckQueueCard => ({ key, prompt: `P ${key}`, answer: `A ${key}`, isNew });
const keys = (session: { cards: { key: string }[] }) => session.cards.map((c) => c.key);

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

Deno.test("initSession + sessionCounts: new cards seed the New bucket, due cards the Review bucket", () => {
  const session = initSession([card("a", true), card("b"), card("c", true)]);
  assertEquals(session.completed, 0);
  assertEquals(session.cards[0].bucket, "new");
  assertEquals(session.cards[0].stepsLeft, NEW_STEPS);
  assertEquals(session.cards[1].bucket, "review");
  assertEquals(sessionCounts(session), { fresh: 2, learning: 0, review: 1 });
});

Deno.test("gradeCurrent: a new card needs two 'good's and cycles back between them (Anki 1m/10m)", () => {
  let session = initSession([card("a", true), card("b"), card("c"), card("d"), card("e")]);

  const first = gradeCurrent(session, "good");
  assertEquals(first.graduated, false); // stays in the session
  assertEquals(first.session.cards[0].key, "b");
  // 'a' re-inserted LEARNING_GAP back, now in the Learning bucket with one step left.
  assertEquals(keys(first.session)[LEARNING_GAP], "a");
  const relearned = first.session.cards.find((c) => c.key === "a")!;
  assertEquals(relearned.bucket, "learning");
  assertEquals(relearned.stepsLeft, NEW_STEPS - 1);
  assertEquals(sessionCounts(first.session), { fresh: 0, learning: 1, review: 4 });

  // Walk 'a' back to the front and grade it 'good' again → it graduates.
  session = first.session;
  while (session.cards[0].key !== "a") session = gradeCurrent(session, "good").session;
  const second = gradeCurrent(session, "good");
  assertEquals(second.graduated, true);
  assertEquals(second.session.cards.some((c) => c.key === "a"), false);
});

Deno.test("gradeCurrent: 'again' relearns and re-queues; 'easy' graduates outright", () => {
  const session = initSession([card("a", true), card("b"), card("c"), card("d")]);

  const again = gradeCurrent(session, "again");
  assertEquals(again.graduated, false);
  assertEquals(keys(again.session), ["b", "c", "d", "a"]); // gap clamps to queue length
  assertEquals(again.session.cards.find((c) => c.key === "a")!.bucket, "learning");
  assertEquals(again.session.cards.find((c) => c.key === "a")!.stepsLeft, NEW_STEPS); // reset

  const easy = gradeCurrent(session, "easy");
  assertEquals(easy.graduated, true);
  assertEquals(keys(easy.session), ["b", "c", "d"]);
});

Deno.test("gradeCurrent: a due review passes out on 'good' but lapses into one-step relearn on 'again'", () => {
  const pass = gradeCurrent(initSession([card("a"), card("b")]), "good");
  assertEquals(pass.graduated, true);
  assertEquals(keys(pass.session), ["b"]);

  const lapse = gradeCurrent(initSession([card("a"), card("b"), card("c"), card("d")]), "again");
  assertEquals(lapse.graduated, false);
  const relapsed = lapse.session.cards.find((c) => c.key === "a")!;
  assertEquals(relapsed.bucket, "learning");
  assertEquals(relapsed.stepsLeft, RELEARN_STEPS);
  // One 'good' now graduates the relearning card.
  let session = lapse.session;
  while (session.cards[0].key !== "a") session = gradeCurrent(session, "good").session;
  assertEquals(gradeCurrent(session, "good").graduated, true);
});

Deno.test("gradeCurrent: empty session is a no-op", () => {
  const empty = initSession([]);
  assertEquals(gradeCurrent(empty, "good"), { graduated: false, session: empty });
});

Deno.test("clozeAnswerHighlight: isolates the tested span from the blanked front", () => {
  assertEquals(
    clozeAnswerHighlight("The capital is [...] and the river is Seine", "The capital is Paris and the river is Seine"),
    { after: " and the river is Seine", before: "The capital is ", highlight: "Paris" },
  );
  // A [hint] blank still aligns to the same revealed span.
  assertEquals(
    clozeAnswerHighlight("The capital is [European city] and the river is Seine", "The capital is Paris and the river is Seine")?.highlight,
    "Paris",
  );
  // Blank at the very start / end.
  assertEquals(clozeAnswerHighlight("[...] is the powerhouse", "Mitochondria is the powerhouse"), {
    after: " is the powerhouse",
    before: "",
    highlight: "Mitochondria",
  });
  assertEquals(clozeAnswerHighlight("The powerhouse is the [...]", "The powerhouse is the mitochondria")?.highlight, "mitochondria");
});

Deno.test("clozeAnswerHighlight: a normal Q/A card is not a cloze and returns null", () => {
  assertEquals(clozeAnswerHighlight("What is 2 + 2?", "4"), null);
  assertEquals(clozeAnswerHighlight("Define [drug]", "A medication"), null); // bracket but no shared context
  assertEquals(clozeAnswerHighlight("Same", "Same"), null);
});

Deno.test("clozeParts: recovers the blank marker alongside before/highlight/after", () => {
  assertEquals(
    clozeParts("The capital is [...] and the river is Seine", "The capital is Paris and the river is Seine"),
    { after: " and the river is Seine", before: "The capital is ", blank: "[...]", highlight: "Paris" },
  );
  // A [hint] blank recovers the full hint text, not just "[...]".
  assertEquals(
    clozeParts("The capital is [European city] and the river is Seine", "The capital is Paris and the river is Seine")
      ?.blank,
    "[European city]",
  );
  // Blank at the very start / end of the sentence.
  assertEquals(clozeParts("[...] is the powerhouse", "Mitochondria is the powerhouse"), {
    after: " is the powerhouse",
    before: "",
    blank: "[...]",
    highlight: "Mitochondria",
  });
  assertEquals(clozeParts("The powerhouse is the [...]", "The powerhouse is the mitochondria")?.blank, "[...]");
});

Deno.test("clozeParts: a normal Q/A card is not a cloze and returns null", () => {
  assertEquals(clozeParts("What is 2 + 2?", "4"), null);
  assertEquals(clozeParts("Define [drug]", "A medication"), null);
  assertEquals(clozeParts("Same", "Same"), null);
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

Deno.test("splitStrayField: tab-free text is returned unchanged", () => {
  assertEquals(splitStrayField("Neutrophils kill pathogens by [...]"), {
    head: "Neutrophils kill pathogens by [...]",
    extra: "",
  });
});

Deno.test("splitStrayField: a tab-joined trailing field is peeled off the front", () => {
  assertEquals(
    splitStrayField("Neutrophils kill pathogens by [...]\tNeutrophil effector functions."),
    { head: "Neutrophils kill pathogens by [...]", extra: "Neutrophil effector functions." },
  );
});

Deno.test("parseDeckSnapshot recovers a stray tab-joined field into the note", () => {
  const json = JSON.stringify({
    v: 1,
    asOf: "2026-07-17T06:00:00Z",
    id: "immuno3",
    name: "Immunology 3",
    stats: { due: 1, fresh: 1, total: 1 },
    queue: [
      { key: "c1", prompt: "Neutrophils kill by [...]\tNeutrophil effector functions.", answer: "NETs", isNew: true },
    ],
  });
  const snap = parseDeckSnapshot(json);
  assertEquals(snap?.queue[0].prompt, "Neutrophils kill by [...]");
  assertEquals(snap?.queue[0].answer, "NETs");
  assertEquals(snap?.queue[0].note, "Neutrophil effector functions.");
});

Deno.test("parseDeckSnapshot de-tabs only the front and never duplicates the note", () => {
  const json = JSON.stringify({
    v: 1,
    asOf: "2026-07-17T06:00:00Z",
    id: "d",
    name: "D",
    stats: { due: 1, fresh: 0, total: 1 },
    // Same trailing title tab-joined onto BOTH fields — the note must show it once.
    queue: [{ key: "c1", prompt: "Front [...]\tSource X", answer: "Answer\tSource X", isNew: false }],
  });
  const card = parseDeckSnapshot(json)?.queue[0];
  assertEquals(card?.prompt, "Front [...]");
  assertEquals(card?.note, "Source X"); // single, not "Source X · Source X"
  assertEquals(card?.answer, "Answer\tSource X"); // answer left verbatim (not truncated)
});
