/**
 * The free rung of the audio cascade, and the failure that makes it dangerous.
 *
 * 🔴 ACCEPTING A BAD DEVICE TRANSCRIPT IS PERMANENT. The audio object is deleted the moment one is
 * accepted, so there is no second chance to transcribe the recording properly. A learner would be
 * left with a forty-minute lecture that says nine words, and nothing in the system would know. Every
 * test below is about the refusals; the acceptance is the easy half.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MIN_DEVICE_CHARS,
  MIN_DEVICE_CHARS_PER_SECOND,
  deviceTranscriptUsable,
} from "./device-transcript";

/** Lecture prose at a realistic density — about 12 characters per second of speech. */
const realTranscript = (seconds: number) =>
  "the point I want to make here is that the structure of the argument matters more than its length ".repeat(
    Math.max(1, Math.ceil((seconds * 12) / 98)),
  );

test("a real device transcript is used, and nobody is billed", () => {
  assert.equal(deviceTranscriptUsable(realTranscript(1_800), 1_800), true);
  assert.equal(deviceTranscriptUsable(realTranscript(45), 45), true);
});

test("🔴 a transcript that stopped after the first minute is refused", () => {
  // The commonest real failure: recognition ran, the app was backgrounded, and the text stops.
  // Ninety seconds of words for a forty-minute lecture must fall through to a paid provider.
  assert.equal(deviceTranscriptUsable(realTranscript(90), 2_400), false);
});

test("🔴 an empty or placeholder transcript is refused", () => {
  assert.equal(deviceTranscriptUsable("", 600), false);
  assert.equal(deviceTranscriptUsable("   ", 600), false);
  assert.equal(deviceTranscriptUsable("[no speech detected]", 600), false);
  assert.equal(deviceTranscriptUsable("ok", 5), false, "below the absolute floor, however short the clip");
});

test("a nonsense duration is refused rather than dividing by it", () => {
  assert.equal(deviceTranscriptUsable(realTranscript(600), 0), false);
  assert.equal(deviceTranscriptUsable(realTranscript(600), -30), false);
  assert.equal(deviceTranscriptUsable(realTranscript(600), Number.NaN), false);
});

test("a quiet seminar with long pauses is still accepted", () => {
  // The floor is a third of the slowest ordinary delivery, so half-speed speech clears it.
  const halfSpeed = "a sentence spoken slowly with pauses between the clauses ".repeat(30);
  assert.ok(halfSpeed.length >= 300 * MIN_DEVICE_CHARS_PER_SECOND);
  assert.equal(deviceTranscriptUsable(halfSpeed, 300), true);
});

test("🔴 the rule in this app and the rule in the edge function have not drifted", () => {
  // The canonical copy runs in Deno, which this repository has no runner for. `workload-cost.ts`
  // solves the same problem the same way: mirror the constants, and read the canonical file off
  // disk so a change to one that is not made to the other fails here.
  const fn = readFileSync(
    new URL("../../../../supabase/functions/nemesis-transcribe/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    fn,
    new RegExp(`MIN_DEVICE_CHARS_PER_SECOND = ${MIN_DEVICE_CHARS_PER_SECOND}\\b`),
    "the per-second floor must match the function's",
  );
  assert.match(
    fn,
    new RegExp(`MIN_DEVICE_CHARS = ${MIN_DEVICE_CHARS}\\b`),
    "and so must the absolute floor",
  );
  assert.match(fn, /export function deviceTranscriptUsable/, "the function must still own the predicate");
  // 🔴 AND THE RESERVATION MUST BE GIVEN BACK. A learner must not spend their paid transcription
  // allowance on minutes nobody paid a provider for.
  assert.match(fn, /p_actual_seconds: 0, p_job_id: jobId, p_status: "done"/);
  // 🔴 AND NO COST IS REPORTED. Reporting a zero would put a provider on the bill that never ran.
  const acceptBlock = fn.slice(fn.indexOf("deviceTranscriptUsable(deviceTranscript"), fn.indexOf("const signedUrl"));
  // Matched on the CALL, not on the name: the block's own comment says out loud that the cost
  // report is deliberately skipped, and a test that could not tell an explanation from a call
  // would forbid the explanation.
  assert.doesNotMatch(acceptBlock, /await reportVoiceCost\(/);
  assert.match(acceptBlock, /deliberately NOT called/, "and the reason must stay written down");
});
