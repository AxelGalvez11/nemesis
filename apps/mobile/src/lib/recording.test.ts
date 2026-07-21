// Deno unit tests (repo convention) for the phone recorder's pure logic.
// Run: deno test --no-check apps/mobile/src/lib/recording.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyRecognitionResult,
  buildRecordingDraft,
  emptyTranscript,
  formatRecordingClock,
  fullTranscript,
  hasTranscript,
  mergeOutputsMeta,
  polishState,
} from "./recording.ts";

Deno.test("interim results rewrite in place until the utterance commits", () => {
  let t = emptyTranscript();
  t = applyRecognitionResult(t, "beta", false);
  t = applyRecognitionResult(t, "beta blockers lower", false);
  assertEquals(t.finals, []);
  assertEquals(t.interim, "beta blockers lower");
  t = applyRecognitionResult(t, "Beta blockers lower heart rate.", true);
  assertEquals(t.finals, ["Beta blockers lower heart rate."]);
  assertEquals(t.interim, "");
});

Deno.test("each committed utterance becomes its own paragraph", () => {
  let t = emptyTranscript();
  t = applyRecognitionResult(t, "First point.", true);
  t = applyRecognitionResult(t, "Second point", false);
  t = applyRecognitionResult(t, "Second point.", true);
  assertEquals(fullTranscript(t), "First point.\n\nSecond point.");
});

Deno.test("an empty final commits nothing; a dangling interim still saves", () => {
  let t = emptyTranscript();
  t = applyRecognitionResult(t, "   ", true);
  assertEquals(t.finals, []);
  assert(!hasTranscript(t));
  t = applyRecognitionResult(t, "cut off mid-sen", false);
  assert(hasTranscript(t));
  assertEquals(fullTranscript(t), "cut off mid-sen");
});

Deno.test("recording clock formats minutes and hours", () => {
  assertEquals(formatRecordingClock(0), "0:00");
  assertEquals(formatRecordingClock(5), "0:05");
  assertEquals(formatRecordingClock(754), "12:34");
  assertEquals(formatRecordingClock(3723), "1:02:03");
  assertEquals(formatRecordingClock(-9), "0:00");
});

Deno.test("draft carries the transcript, rounded duration, and ISO timestamp", () => {
  let t = emptyTranscript();
  t = applyRecognitionResult(t, "Renal dosing depends on CrCl.", true);
  const at = new Date("2026-07-21T15:30:00.000Z");
  const draft = buildRecordingDraft(t, 61.6, at);
  assertEquals(draft.transcript, "Renal dosing depends on CrCl.");
  assertEquals(draft.durationSeconds, 62);
  assertEquals(draft.createdAt, "2026-07-21T15:30:00.000Z");
  assert(draft.title.startsWith("Recording · "));
});

Deno.test("mergeOutputsMeta appends, preserves other keys, and dedupes by id", () => {
  const entry = { id: "r1", kind: "recording" as const, title: "Recording · now", transcript: "hi", durationSeconds: 3 };
  assertEquals(mergeOutputsMeta(null, entry), { outputs: [entry] });
  const merged = mergeOutputsMeta({ sources: ["keep-me"], outputs: [{ id: "a", kind: "report", title: "T" }] }, entry);
  assertEquals(merged.sources, ["keep-me"]);
  assertEquals((merged.outputs as unknown[]).length, 2);
  const replaced = mergeOutputsMeta({ outputs: [{ ...entry, title: "old title" }] }, entry);
  assertEquals((replaced.outputs as unknown[]).length, 1);
  assertEquals((replaced.outputs as { title: string }[])[0].title, "Recording · now");
});

Deno.test("draft folds live notes in; default stays empty", () => {
  let t = emptyTranscript();
  t = applyRecognitionResult(t, "Loop diuretics act on the ascending limb.", true);
  const at = new Date("2026-07-21T15:30:00.000Z");
  assertEquals(buildRecordingDraft(t, 10, at).notes, "");
  assertEquals(buildRecordingDraft(t, 10, at, "one\ntwo").notes, "one\ntwo");
});

Deno.test("polish state: pending while fresh, silent once stale, done sticks", () => {
  const now = new Date("2026-07-21T16:00:00.000Z");
  const fresh = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
  const stale = new Date(now.getTime() - 46 * 60 * 1000).toISOString();
  assertEquals(polishState({ createdAt: fresh, polish: "pending" }, now), "pending");
  assertEquals(polishState({ createdAt: stale, polish: "pending" }, now), "none");
  assertEquals(polishState({ createdAt: stale, polish: "done" }, now), "done");
  assertEquals(polishState({ createdAt: fresh }, now), "none");
  assertEquals(polishState({ polish: "pending" }, now), "pending");
});
