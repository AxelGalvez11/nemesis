import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecordingNoteMessages,
  formatLiveDuration,
  RECORDING_NOTE_TRANSCRIPT_CHARS,
  RECORDING_TITLE_MAX_CHARS,
  splitRecordingNote,
} from "./recording-note";

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

// The title rides on the compose call rather than a second round-trip, so the
// instruction that produces it belongs in the pinned prompt.
test("the compose prompt asks for a subject title on the first line", () => {
  const [system] = buildRecordingNoteMessages("Some lecture text.");
  assert.ok(system);
  assert.match(system.content, /Start your reply with one line in exactly this form: Title:/);
  assert.match(system.content, /never the word 'Recording', never a date/);
});

test("the title line comes off the front of the note", () => {
  const { body, title } = splitRecordingNote("Title: Statutory interpretation and plain meaning\n\n## What this covered\n\nThe lecture…");
  assert.equal(title, "Statutory interpretation and plain meaning");
  assert.equal(body, "## What this covered\n\nThe lecture…");
});

test("the decoration models add to that line is stripped too", () => {
  for (const line of [
    '**Title:** "Statutory interpretation."',
    "# Title: *Statutory interpretation.*",
    "Title:   Statutory   interpretation.  ",
    "__Title__: `Statutory interpretation`.",
  ]) {
    const { title } = splitRecordingNote(`${line}\n\nBody.`);
    assert.equal(title, "Statutory interpretation", `from ${line}`);
  }
});

// The failure to design for is the model ignoring the instruction. Guessing
// that line one was a heading would silently eat a real first paragraph.
test("a note with no title line comes back byte-identical", () => {
  const raw = "## What this covered\n\nThe lecture worked through how a statute is read.\n";
  const { body, title } = splitRecordingNote(raw);
  assert.equal(title, "");
  assert.equal(body, raw);
});

test("a 'Title:' further down the note is left alone", () => {
  const raw = "## Slide 3\n\nTitle: the professor's own wording here\n";
  const { body, title } = splitRecordingNote(raw);
  assert.equal(title, "");
  assert.equal(body, raw);
});

// Matched the label, so the line is scaffolding either way — leaving a bare
// "Title:" at the top of a Library note would be worse than the dated fallback.
test("an empty title still loses its line, and falls back to no title", () => {
  const { body, title } = splitRecordingNote("Title:\n\nBody stays.");
  assert.equal(title, "");
  assert.equal(body, "Body stays.");
});

test("an over-long title clips on a word boundary", () => {
  const long = `Title: ${"Statutory interpretation and the plain meaning rule as applied by appellate courts since 1998"}\n\nBody.`;
  const { title } = splitRecordingNote(long);
  assert.ok(title.length <= RECORDING_TITLE_MAX_CHARS, `${title.length} chars`);
  assert.doesNotMatch(title, /\s$/);
  assert.ok(!title.endsWith("appellat"), "clipped mid-word");
});

// This string becomes a FILENAME. safeLeaf only guards path separators.
test("a title carries nothing that would wreck a filename", () => {
  const { title } = splitRecordingNote('Title: **"Kinetics: zero *vs* first order."**\n\nBody.');
  assert.doesNotMatch(title, /[*_`"'“”‘’]/);
  assert.doesNotMatch(title, /\.$/);
});

test("an empty reply is not a title", () => {
  assert.deepEqual(splitRecordingNote(""), { body: "", title: "" });
  assert.deepEqual(splitRecordingNote("\n\n  \n"), { body: "\n\n  \n", title: "" });
});
