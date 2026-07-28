import assert from "node:assert/strict";
import test from "node:test";

import { buildRecordingNoteMessages, formatLiveDuration, RECORDING_NOTE_TRANSCRIPT_CHARS } from "./recording-note";

test("duration reads as mm:ss until it passes an hour", () => {
  assert.equal(formatLiveDuration(0), "0:00");
  assert.equal(formatLiveDuration(9), "0:09");
  assert.equal(formatLiveDuration(605), "10:05");
  assert.equal(formatLiveDuration(3_661), "1:01:01");
  assert.equal(formatLiveDuration(-5), "0:00", "a negative clock is still a clock");
});

// The owner's complaint about the old recorder was "quality notes, not just
// bullet points of facts". That came from writing live, in 45-second slices —
// a constraint of being live, not a description of a good note. This prompt is
// the one that no longer has that constraint, so the instruction that matters
// is organise BY IDEA rather than by the clock.
test("the compose prompt organises by idea, not by chronology", () => {
  const [system] = buildRecordingNoteMessages("Some lecture text.");
  assert.ok(system);
  assert.match(system.content, /BY IDEA, not by chronology/);
  assert.match(system.content, /a page of bare bullets is not/);
  assert.match(system.content, /Never add material that was not said/);
  assert.match(system.content, /examinable/);
});

test("the transcript rides in the user message and the context line is optional", () => {
  const withContext = buildRecordingNoteMessages("Beta blockers lower cardiac output.", "Pharmacology lecture 7");
  assert.match(withContext[1]?.content ?? "", /Session context: Pharmacology lecture 7/);
  assert.match(withContext[1]?.content ?? "", /Beta blockers lower cardiac output\./);

  const without = buildRecordingNoteMessages("Beta blockers lower cardiac output.");
  assert.doesNotMatch(without[1]?.content ?? "", /Session context/);
});

// The clip takes the END of a long recording. A three-hour session that ran
// past the window should keep its conclusions, not its opening housekeeping.
test("an over-long transcript keeps its ending", () => {
  const transcript = `${"x".repeat(RECORDING_NOTE_TRANSCRIPT_CHARS + 5_000)}THE CONCLUSION`;
  const [, user] = buildRecordingNoteMessages(transcript);
  assert.ok(user);
  assert.match(user.content, /THE CONCLUSION$/);
  assert.ok(user.content.length < transcript.length);
});
