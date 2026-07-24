// Deno unit tests (repo convention) for the phone recorder's pure logic.
// Run: deno test --no-check apps/mobile/src/lib/recording.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyRecognitionResult,
  buildRecordingDraft,
  buildRecordingNoteMarkdown,
  buildRecordingTitleMessages,
  cleanRecordingTitle,
  emptyTranscript,
  formatRecordingClock,
  fullTranscript,
  hasTranscript,
  mergeOutputsMeta,
  polishState,
  RECORDING_TITLE_MAX_CHARS,
  RECORDING_TITLE_TRANSCRIPT_CHARS,
  spokenDuration,
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

Deno.test("spokenDuration reads the recording length in plain minutes", () => {
  // The four boundaries the card has to get right (owner item 3).
  assertEquals(spokenDuration(0), "less than a minute");
  assertEquals(spokenDuration(59), "less than a minute");
  assertEquals(spokenDuration(60), "1 minute");
  assertEquals(spokenDuration(90 * 60), "90 minutes");
  // Floored like a clock: a 25:40 lecture reads "25 minutes", not 26.
  assertEquals(spokenDuration(25 * 60 + 40), "25 minutes");
  // A negative/garbage duration never reads as a negative minute count.
  assertEquals(spokenDuration(-5), "less than a minute");
});

Deno.test("cleanRecordingTitle unwraps the model's title, or keeps the timestamp", () => {
  assertEquals(cleanRecordingTitle("Beta-Blocker Pharmacology"), "Beta-Blocker Pharmacology");
  // Common wrappers a chat-route reply adds.
  assertEquals(cleanRecordingTitle('"Loop Diuretics Overview"'), "Loop Diuretics Overview");
  assertEquals(cleanRecordingTitle("Title: Renal Clearance Basics"), "Renal Clearance Basics");
  assertEquals(cleanRecordingTitle("**Cardiac Cycle Review**"), "Cardiac Cycle Review");
  assertEquals(cleanRecordingTitle("# Enzyme Kinetics"), "Enzyme Kinetics");
  assertEquals(cleanRecordingTitle("Antibiotic Resistance."), "Antibiotic Resistance");
  // Multi-line reply: the first real line is the title, chatter below is dropped.
  assertEquals(cleanRecordingTitle("\n\nGlomerular Filtration\nHere is your title."), "Glomerular Filtration");
  // Empty / whitespace-only → null so the caller keeps the existing title.
  assertEquals(cleanRecordingTitle(""), null);
  assertEquals(cleanRecordingTitle("   \n  "), null);
  assertEquals(cleanRecordingTitle('""'), null);
  // Over-long titles are capped to a headline.
  const long = "A ".repeat(120).trim();
  const cleaned = cleanRecordingTitle(long);
  assert(cleaned !== null && cleaned.length <= RECORDING_TITLE_MAX_CHARS);
});

Deno.test("buildRecordingTitleMessages asks on one transcript turn and clips it", () => {
  const messages = buildRecordingTitleMessages("x".repeat(RECORDING_TITLE_TRANSCRIPT_CHARS + 500));
  assertEquals(messages.length, 2);
  assertEquals(messages[0].role, "system");
  assertEquals(messages[1].role, "user");
  // The user turn carries only the clipped transcript (plus the short label).
  assert(messages[1].content.includes("x".repeat(100)));
  assert(messages[1].content.length <= RECORDING_TITLE_TRANSCRIPT_CHARS + 40);
});

Deno.test("recording Library note: notes become bullets, no duplicate title heading", () => {
  const md = buildRecordingNoteMarkdown({
    includeTranscript: false,
    notes: "Beta blockers lower heart rate\nChlorophyll absorbs red and blue light",
    transcript: "full transcript here",
  });
  // liveNotesText joins points with bare newlines; each becomes its own bullet.
  assertEquals(md, "- Beta blockers lower heart rate\n- Chlorophyll absorbs red and blue light\n");
  // No "# <title>" — note.tsx renders the title itself (would double up).
  assert(!md.includes("#"));
  // Transcript is withheld unless the setting is on.
  assert(!md.includes("Transcript"));
});

Deno.test("recording Library note: transcript appended only when the setting is on", () => {
  const withT = buildRecordingNoteMarkdown({ includeTranscript: true, notes: "Point one", transcript: "the words spoken" });
  assertEquals(withT, "- Point one\n\n## Transcript\n\nthe words spoken\n");
});

Deno.test("recording Library note: already-bulleted lines aren't double-bulleted", () => {
  const md = buildRecordingNoteMarkdown({ includeTranscript: false, notes: "- Already a bullet\n* star bullet", transcript: "" });
  assertEquals(md, "- Already a bullet\n* star bullet\n");
});

Deno.test("recording Library note: empty notes / transcript degrade to a plain line, never a blank file", () => {
  // A short or quiet recording: no notes captured at all.
  assertEquals(
    buildRecordingNoteMarkdown({ includeTranscript: false, notes: undefined, transcript: "" }),
    "No notes were captured for this recording.\n",
  );
  // Setting on but the transcript is empty too — still says so rather than an empty section.
  assertEquals(
    buildRecordingNoteMarkdown({ includeTranscript: true, notes: "   \n  ", transcript: "   " }),
    "No notes were captured for this recording.\n\n## Transcript\n\nNo transcript was captured for this recording.\n",
  );
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
