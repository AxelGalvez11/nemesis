import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// ── Dictation where the browser cannot listen (owner, 2026-08-22) ────────────────────────────
//
// *"Keep browser, add xAI fallback."* The browser recogniser stays first wherever it exists —
// free, on-device, words on screen while you are still speaking — and xAI fills the hole where it
// does not. Firefox ships no recogniser, and until now the microphone did not appear there at all.
//
// Source assertions, which is the only kind available: this runner has no MediaRecorder, no
// microphone and no Deno. The decisions themselves are tested for real in `dictation-engine.test.ts`.

const HOOK = readFileSync(new URL("../../components/workspace/learn/use-canvas-dictation.ts", import.meta.url), "utf8");
const FUNCTION = readFileSync(new URL("../../../../supabase/functions/nemesis-dictate/index.ts", import.meta.url), "utf8");
/** The function with its prose stripped, so a provider NAMED in a comment is not read as one CALLED. */
const FUNCTION_CODE = FUNCTION.split("\n")
  .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
  .join("\n");
const CONFIG = readFileSync(new URL("../../../../supabase/config.toml", import.meta.url), "utf8");
const COMPOSER = readFileSync(new URL("../../components/workspace/learn/canvas-composer.tsx", import.meta.url), "utf8");
const HOME = readFileSync(new URL("../../components/workspace/learn/canvas-home.tsx", import.meta.url), "utf8");

test("🔴🔴 the browser lane is untouched — xAI runs only when there is no recogniser", () => {
  // Calibration: make the hook take the recording path unconditionally and this reddens.
  assert.match(HOOK, /if \(lane === "xai"\) \{/, "the fallback is not gated on the chosen lane");
  assert.match(HOOK, /const Engine = recogniser\(\);/, "the browser path is gone");
  assert.match(HOOK, /engineFor\(\{ mediaRecorder: canRecord\(\), speechRecognition: recogniser\(\) !== null \}\)/);
});

test("🔴🔴 the microphone now EXISTS in a browser with no recogniser", () => {
  // This is the whole point. `speechRecognitionSupported()` gated whether the button rendered at
  // all, so Firefox showed no microphone — "your browser cannot" and "Nemesis cannot" look
  // identical from the outside. Calibration: make it `recogniser() !== null` again and this reddens.
  assert.match(HOOK, /export function speechRecognitionSupported\(\): boolean \{\n  return dictationEngine\(\) !== "none";/);
  // Both surfaces still gate the button on it, which is why the meaning had to widen rather than a
  // second predicate being introduced beside it.
  assert.match(COMPOSER, /dictation\.supported && \(/);
  assert.match(HOME, /dictation\.supported && \(/);
});

test("🔴🔴 ONE microphone stream, shared with the recorder", () => {
  // `lib/workspace/mic-level.ts` argues never to open the microphone twice. The Web Speech API is
  // the exception it does not cover (it owns its mic privately and exposes nothing to read); the
  // recording lane has no such excuse. Calibration: call getUserMedia again for the recorder and
  // this reddens.
  assert.equal((HOOK.match(/getUserMedia\(/g) ?? []).length, 1, "the recorder opens a second microphone");
  assert.match(HOOK, /new MediaRecorder\(stream, \{ mimeType: mime \}\)/);
});

test("🔴 the recording is bounded in the client as well as the server", () => {
  // A recorder left open in a pocket is an allowance quietly drawn down, and stopping it here means
  // the learner GETS the two minutes they spoke instead of a 413.
  assert.match(HOOK, /cap\.current = window\.setTimeout\(\(\) => stop\(\), MAX_DICTATION_SECONDS \* 1_000\)/);
  assert.match(FUNCTION, /const MAX_SECONDS = 120;/, "the server takes the client's word for the length");
  assert.match(FUNCTION, /const MAX_BYTES = /);
});

test("🔴🔴 ONLY xAI — the fallback has no ladder and never reaches the other providers", () => {
  // Owner: xAI is the default for dictation. A fallback for a fallback, on a clip the learner can
  // simply re-record, is machinery bought for nothing — and it is also how a "cheaper provider"
  // quietly stops being the one that runs.
  assert.ok(!/assembly|groq|modulate/i.test(FUNCTION_CODE), "another transcription provider is reachable");
  assert.equal((FUNCTION_CODE.match(/https:\/\/api\./g) ?? []).length, 1, "more than one vendor is called");
  assert.match(FUNCTION_CODE, /https:\/\/api\.x\.ai\/v1\/stt/);
});

test("🔴🔴 metered BEFORE the provider call, on the conversational voice allowance", () => {
  // Metering after a successful call is metering nothing: the money is spent the moment xAI
  // answers. And it draws on `stt`, the same meter reading aloud uses — billing dictation against
  // the recordings allowance would take it out of what a student bought for their lectures.
  const charge = FUNCTION.indexOf("await chargeVoiceSeconds(");
  const call = FUNCTION.indexOf("await transcribeWithXai(");
  assert.ok(charge > 0 && call > 0);
  assert.ok(charge < call, "the learner is charged after the money has already been spent");
  assert.match(FUNCTION, /p_kind: "stt"/);
});

test("🔴🔴 the audio is deleted on EVERY path, including failure", () => {
  // "A spoken answer is a keystroke, not a document." The lecture lane made the same promise in its
  // own comments and it was quietly false for weeks — 29 files left in the bucket — because the
  // delete ran only on success and its result was never checked.
  assert.match(FUNCTION, /\} finally \{[\s\S]*await removeObject\(path\);/, "cleanup is not on the finally path");
  assert.match(FUNCTION, /if \(!res\.ok\) \{\n      console\.error\(JSON\.stringify\(\{\n        event: "dictation_cleanup_rejected"/, "a refused delete is unchecked again");
});

test("🔴 the provider request shape is COPIED from the lane that runs in production, not invented", () => {
  // Writing a provider against a guessed request shape is how a field gets silently ignored, and
  // `nemesis-transcribe` says exactly that in its own comments. Two fields differ, both on purpose:
  // no `diarize` (one speaker), and the learner's language rather than a hardcoded `en`.
  const TRANSCRIBE = readFileSync(new URL("../../../../supabase/functions/nemesis-transcribe/index.ts", import.meta.url), "utf8");
  for (const field of ['form.set("url"', 'form.set("format", "true")', 'form.set("vad_threshold", "0.08")']) {
    assert.ok(FUNCTION.includes(field), `${field} is missing from the dictation call`);
    assert.ok(TRANSCRIBE.includes(field), `${field} is not the shape the production lane uses`);
  }
  assert.ok(!/form\.set\("diarize"/.test(FUNCTION), "per-word speakers are being asked for on a one-speaker clip");
  assert.match(FUNCTION, /form\.set\("language", language\)/, "the language is hardcoded");
});

test("🔴 an empty 200 is a named failure, not 'you said nothing'", () => {
  // This provider returned HTTP 200 with an empty transcript for weeks on the lecture lane before
  // anyone noticed. Here it would tell a learner who just spoke a sentence that they had not.
  assert.match(FUNCTION, /reason: "empty-transcript"/);
  assert.match(HOOK, /Nothing could be made out\./);
});

test("🔴🔴 every failure is named in the learner's terms and ends with 'type instead'", () => {
  // A microphone that swallows a spoken sentence and says nothing is the worst version of this
  // feature: the work of composing out loud is already done, and silence says neither what happened
  // nor what to do next.
  for (const status of ["402", "503", "422"]) {
    assert.ok(HOOK.includes(`res.status === ${status}`), `HTTP ${status} is not distinguished`);
  }
  assert.equal((HOOK.match(/You can type instead\./g) ?? []).length >= 4, true);
});

test("🔴 the wait between stopping and the words arriving is visible", () => {
  // The browser lane writes as it hears, so there is no gap; the recording lane has a real one, and
  // a microphone that goes quiet with nothing on screen reads as a control that ate the sentence.
  assert.match(HOOK, /transcribing: boolean;/);
  for (const [surface, source] of [["composer", COMPOSER], ["front door", HOME]] as const) {
    assert.match(source, /dictation\.transcribing && \(/, `${surface} shows no sign of the wait`);
  }
});

test("🔴🔴 verify_jwt is RECORDED for both voice functions, not left to a remembered flag", () => {
  // config.toml already documents this trap twice — "someone forgets on the next deploy" — and
  // `nemesis-speak` had demanded it in its own header since the day it shipped without ever being
  // written down here. The gateway rejects a user JWT before the function runs.
  for (const fn of ["nemesis-speak", "nemesis-dictate"]) {
    const at = CONFIG.indexOf(`[functions.${fn}]`);
    assert.ok(at > 0, `${fn} has no config entry`);
    assert.match(CONFIG.slice(at, at + 120), /verify_jwt = false/, `${fn} would deploy behind the gateway check`);
  }
});
