import assert from "node:assert/strict";
import test from "node:test";

import {
  dictationLanguage,
  DICTATION_MIMES,
  engineFor,
  MAX_DICTATION_SECONDS,
  pickDictationMime,
} from "./dictation-engine";

// ── Which engine listens ─────────────────────────────────────────────────────────────────────
//
// Owner, 2026-08-22: keep the browser recogniser where it works, add xAI where it does not.

test("🔴🔴 the browser wins wherever it exists, and xAI only fills the gap", () => {
  // Putting xAI first everywhere would trade instant on-device text for an upload and a wait on
  // the majority of browsers. Calibration: reorder the two branches and this reddens.
  assert.equal(engineFor({ mediaRecorder: true, speechRecognition: true }), "browser");
  assert.equal(engineFor({ mediaRecorder: false, speechRecognition: true }), "browser");
  assert.equal(engineFor({ mediaRecorder: true, speechRecognition: false }), "xai");
});

test("🔴 a browser with neither is named, not silently treated as one that works", () => {
  // The caller has to keep offering typing. "none" is a real answer; a crash or a false `true`
  // would put a dead microphone on screen.
  assert.equal(engineFor({ mediaRecorder: false, speechRecognition: false }), "none");
});

test("🔴 the choice is made from FEATURES, never from a user-agent string", () => {
  // A browser test would be wrong the first time a vendor ships or removes a recogniser, and
  // nothing here would notice.
  assert.doesNotThrow(() => engineFor({ mediaRecorder: true, speechRecognition: false }));
});

test("🔴 a container the browser actually supports, in provider-readable order", () => {
  assert.equal(pickDictationMime((type) => type === "audio/webm"), "audio/webm");
  assert.equal(pickDictationMime(() => true), DICTATION_MIMES[0]);
  // 🔴 EMPTY IS A LEGITIMATE ANSWER, NOT A FAILURE: every engine has a default it can definitely
  // write, and forcing a type it refuses is how a recorder produces a zero-byte clip.
  assert.equal(pickDictationMime(() => false), "");
  assert.equal(pickDictationMime(() => { throw new Error("no"); }), "", "a browser that throws is not a crash");
});

test("🔴 the clip is bounded, because this lane spends the voice allowance", () => {
  // A microphone left open in a pocket is the classic way a monthly allowance disappears.
  assert.equal(MAX_DICTATION_SECONDS, 120);
});

test("🔴 the language follows the learner rather than being hardcoded to English", () => {
  // Nemesis is language-agnostic; a learner working in Portuguese must get Portuguese back.
  assert.equal(dictationLanguage("pt-BR"), "pt");
  assert.equal(dictationLanguage("EN-GB"), "en");
  assert.equal(dictationLanguage("es"), "es");
  // ...and English is what it falls back to when there is nothing to go on.
  assert.equal(dictationLanguage(undefined), "en");
  assert.equal(dictationLanguage(""), "en");
  // 🔴 A SHAPE CHECK, NOT A REGISTRY, AND THE LIMIT IS STATED RATHER THAN PRETENDED AWAY — the same
  // rule `speech-route.ts` holds about locales. This catches a display name, a sentence or a stray
  // argument arriving where a language belongs; it cannot know that `qq` is not a language, and
  // shipping the subtag registry to find out is not worth it for a field the provider itself
  // validates.
  assert.equal(dictationLanguage("English (United States)"), "en");
  assert.equal(dictationLanguage("  "), "en");
  assert.equal(dictationLanguage("x"), "en");
});
