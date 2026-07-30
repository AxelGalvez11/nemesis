import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isDefaultRecordingTitle, recordingTitle } from "./recording.ts";
import { safeLibraryTitle } from "./library-paths.ts";

Deno.test("a freshly saved recording still wears its placeholder name", () => {
  assertEquals(isDefaultRecordingTitle(recordingTitle(new Date("2026-07-30T22:23:00Z"))), true);
});

// The Library's copy has been through safeLibraryTitle, which turns "5:23 PM"
// into "5-23 PM" — the two are never string-equal, which is why this is a prefix
// test and not an equality test.
Deno.test("the sanitised Library copy is recognised too", () => {
  const sanitised = safeLibraryTitle(recordingTitle(new Date("2026-07-30T22:23:00Z")));
  assertEquals(isDefaultRecordingTitle(sanitised), true);
});

// THE POINT OF THE GUARD. The write-up pass finishes minutes after Save — long
// enough for the student to have named it themselves. Silently undoing that would
// be worse than the timestamp it replaces.
Deno.test("a name the student chose is never treated as a placeholder", () => {
  assertEquals(isDefaultRecordingTitle("Corvette pickup at the museum"), false);
  assertEquals(isDefaultRecordingTitle("Week 3 seminar"), false);
  assertEquals(isDefaultRecordingTitle(""), false);
});

Deno.test("leading whitespace does not hide the placeholder", () => {
  assertEquals(isDefaultRecordingTitle("  Recording · Jul 30, 2026 at 5:23 PM"), true);
});

// "Recordings" and "Recording of..." are the student's words, not our format.
Deno.test("a title that merely starts with the word Recording is not the placeholder", () => {
  assertEquals(isDefaultRecordingTitle("Recording of the lab session"), false);
  assertEquals(isDefaultRecordingTitle("Recordings to revisit"), false);
});
