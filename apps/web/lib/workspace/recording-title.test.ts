import assert from "node:assert/strict";

import {
  buildRecordingTitleMessages,
  cleanRecordingTitle,
  RECORDING_TITLE_MAX_CHARS,
  spokenRecordingDuration,
} from "./recording-title";

// ── The prompt ──────────────────────────────────────────────────────────────

const prompt = buildRecordingTitleMessages("Today we cover Michaelis-Menten kinetics.", "- enzyme saturation");
assert.equal(prompt.length, 2);
assert.equal(prompt[0]?.role, "system");
// Subject-agnostic and it asks for a title, not a summary.
assert.match(prompt[0]?.content ?? "", /title/i);
assert.match(prompt[0]?.content ?? "", /never assume a biomedical/i);
// The transcript (and the notes hint) reach the user turn.
assert.match(prompt[1]?.content ?? "", /Michaelis-Menten kinetics/);
assert.match(prompt[1]?.content ?? "", /enzyme saturation/);

// Only the head of a long transcript is sent (cost + the topic is stated early).
const longTranscript = "OPENING TOPIC. " + "filler ".repeat(1_000);
const longPrompt = buildRecordingTitleMessages(longTranscript);
assert.ok((longPrompt[1]?.content.length ?? 0) < 2_300, "transcript should be clipped to its head");
assert.match(longPrompt[1]?.content ?? "", /OPENING TOPIC/);

// ── Cleaning real model habits ───────────────────────────────────────────────

// Surrounding straight quotes + trailing period.
assert.equal(cleanRecordingTitle('"Intro to Pharmacokinetics."'), "Intro to Pharmacokinetics");
// Smart quotes.
assert.equal(cleanRecordingTitle("“Cellular Respiration”"), "Cellular Respiration");
// A "**Topic:** X" label with markdown emphasis.
assert.equal(cleanRecordingTitle("**Topic:** Michaelis-Menten Kinetics"), "Michaelis-Menten Kinetics");
// A "Title:" label followed by a paragraph — first line only.
assert.equal(
  cleanRecordingTitle("Title: The French Revolution\n\nThis lecture covers the causes and course of..."),
  "The French Revolution",
);
// A fenced block.
assert.equal(cleanRecordingTitle("```\nOhm's Law\n```"), "Ohm's Law");
// Internal apostrophe survives (only surrounding quotes are stripped).
assert.equal(cleanRecordingTitle("Newton's Laws of Motion"), "Newton's Laws of Motion");
// Leading bullet marker.
assert.equal(cleanRecordingTitle("- Supply and Demand"), "Supply and Demand");

// Never end up untitled / null / empty.
assert.equal(cleanRecordingTitle("null"), null);
assert.equal(cleanRecordingTitle("Untitled"), null);
assert.equal(cleanRecordingTitle(""), null);
assert.equal(cleanRecordingTitle("   "), null);
assert.equal(cleanRecordingTitle(null), null);
assert.equal(cleanRecordingTitle(undefined), null);

// Over-long titles are capped on a word boundary, no dangling punctuation.
const long = cleanRecordingTitle(
  "The Comprehensive History of the Roman Empire from Its Founding to Its Eventual Fall",
);
assert.ok(long && long.length <= RECORDING_TITLE_MAX_CHARS, "capped to the max");
assert.ok(long && !/\s$/.test(long), "no trailing whitespace after the cut");
assert.doesNotMatch(long ?? "", /[.,;:!?-]$/, "no dangling punctuation after the cut");

// ── Spoken duration ──────────────────────────────────────────────────────────

// The exact boundaries the owner called out.
assert.equal(spokenRecordingDuration(0), "Recorded under a minute");
assert.equal(spokenRecordingDuration(59), "Recorded under a minute");
assert.equal(spokenRecordingDuration(60), "Recorded 1 minute");
assert.equal(spokenRecordingDuration(90 * 60), "Recorded 1 hour 30 minutes");
// The owner's own example strings.
assert.equal(spokenRecordingDuration(25 * 60), "Recorded 25 minutes");
assert.equal(spokenRecordingDuration(65 * 60), "Recorded 1 hour 5 minutes");
// Whole hours drop the minutes; plurals are correct.
assert.equal(spokenRecordingDuration(60 * 60), "Recorded 1 hour");
assert.equal(spokenRecordingDuration(2 * 60 * 60), "Recorded 2 hours");
assert.equal(spokenRecordingDuration(2 * 60), "Recorded 2 minutes");
// Sub-minute remainders round DOWN (89s is one minute, not almost two).
assert.equal(spokenRecordingDuration(119), "Recorded 1 minute");
// Negative / garbage clamps to the floor.
assert.equal(spokenRecordingDuration(-10), "Recorded under a minute");

console.log("recording-title.test.ts OK");
