// Deno unit tests (repo convention) for the Record screen's live-notes logic.
// Run: deno test --no-check apps/mobile/src/lib/live-notes.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildLiveNotesMessages,
  LIVE_NOTES_INTERVAL_MS,
  LIVE_NOTES_MIN_CHARS,
  liveNotesText,
  mergeLiveNotes,
  parseLiveNotes,
  shouldRequestLiveNotes,
} from "./live-notes.ts";

const openGate = {
  inFlight: false,
  lastAt: 0,
  lastLength: 0,
  now: 1_000_000,
  transcriptLength: LIVE_NOTES_MIN_CHARS + 200,
};

Deno.test("gate opens immediately once the transcript is long enough", () => {
  assert(shouldRequestLiveNotes(openGate));
});

Deno.test("gate stays shut for short transcripts, in-flight calls, and the cooldown", () => {
  assert(!shouldRequestLiveNotes({ ...openGate, transcriptLength: LIVE_NOTES_MIN_CHARS - 1 }));
  assert(!shouldRequestLiveNotes({ ...openGate, inFlight: true }));
  assert(!shouldRequestLiveNotes({ ...openGate, lastAt: openGate.now - LIVE_NOTES_INTERVAL_MS + 1 }));
  assert(shouldRequestLiveNotes({ ...openGate, lastAt: openGate.now - LIVE_NOTES_INTERVAL_MS }));
});

Deno.test("a silent stretch (no transcript growth) never spends a call", () => {
  const length = LIVE_NOTES_MIN_CHARS + 500;
  assert(!shouldRequestLiveNotes({ ...openGate, transcriptLength: length, lastLength: length }));
  assert(!shouldRequestLiveNotes({ ...openGate, transcriptLength: length, lastLength: length - 10 }));
  assert(shouldRequestLiveNotes({ ...openGate, transcriptLength: length, lastLength: length - 400 }));
});

Deno.test("messages carry prior notes and clip the transcript tail", () => {
  const messages = buildLiveNotesMessages("x".repeat(9_000), ["alpha", "beta"], "Pharmacology lecture");
  assertEquals(messages.length, 2);
  assertEquals(messages[0].role, "system");
  assert(messages[0].content.includes("notes (up to 6 concise new note bullets)"));
  assert(messages[1].content.includes("Known session context: Pharmacology lecture"));
  assert(messages[1].content.includes("- alpha\n- beta"));
  assert(messages[1].content.length < 9_000);
});

Deno.test("parse survives fences, junk, and extra keys; rejects non-JSON", () => {
  assertEquals(parseLiveNotes('```json\n{"notes":["First point","Second point"]}\n```'), ["First point", "Second point"]);
  assertEquals(parseLiveNotes('Sure! {"notes":["Only this"],"explore":["ignored"]}'), ["Only this"]);
  assertEquals(parseLiveNotes("no json here"), []);
  assertEquals(parseLiveNotes('{"notes":"not an array"}'), []);
});

Deno.test("parse dedupes, trims whitespace runs, and caps at six per pass", () => {
  const notes = parseLiveNotes(JSON.stringify({ notes: ["a  a", "a a", "b", "c", "d", "e", "f", "g"] }));
  assertEquals(notes, ["a a", "b", "c", "d", "e", "f"]);
});

Deno.test("merge dedupes across passes and keeps only the newest 18", () => {
  const first = Array.from({ length: 15 }, (_, i) => `note ${i}`);
  const merged = mergeLiveNotes(first, ["note 3", "fresh 1", "fresh 2", "fresh 3", "fresh 4", "fresh 5"]);
  assertEquals(merged.length, 18);
  assertEquals(merged[0], "note 2");
  assertEquals(merged[merged.length - 1], "fresh 5");
  assertEquals(merged.filter((note) => note === "note 3").length, 1);
});

Deno.test("saved notes text joins with plain newlines (web parity)", () => {
  assertEquals(liveNotesText(["one", "two"]), "one\ntwo");
  assertEquals(liveNotesText([]), "");
});
