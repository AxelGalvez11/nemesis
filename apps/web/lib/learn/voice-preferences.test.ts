import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VOICE_MODE,
  readVoiceMode,
  writeVoiceMode,
} from "./voice-preferences";

// 🔴🔴 THE AUTO-DICTATION HALF OF THIS FILE IS GONE, 2026-08-25. It covered `AutoDictation`,
// `readAutoDictation`/`writeAutoDictation`, `shouldAskAboutAutoDictation` and `shouldOpenDictation`
// — five tests pinning a microphone that opened by itself after Nemesis finished speaking. The
// owner removed the menu row that turned that on (*"remove … the 'open mic after each question'
// option"*), which was the only switch it had, so the lane could no longer run at all and was
// deleted rather than left in the file untestable-by-design.
//
// 🔴 WHAT THOSE TESTS WERE PROTECTING IS STILL WORTH KNOWING, and is why this note stays instead of
// a silent deletion: unreadable storage had to read as "unasked" and never as "off" (silently
// deciding a learner refused is worse than asking twice), the microphone was allowed to open after
// a QUESTION and never after a correction, and every condition was read at the moment of use rather
// than latched when speech began — because someone who switches voice off mid-sentence is telling
// you not to open a microphone a second later. Any future auto-listen feature owes all four.

/** A localStorage stand-in. The real one is unavailable to this runner. */
function fakeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    read: (key: string) => store.get(key) ?? null,
  };
}

/** A storage that throws on every call — private browsing, or a full quota. */
const hostileStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

test("voice mode is OFF until the learner turns it on", () => {
  assert.equal(DEFAULT_VOICE_MODE, "off");
  assert.equal(readVoiceMode(fakeStorage()), "off");
  assert.equal(readVoiceMode(null), "off");
});

test("the voice-mode preference round-trips", () => {
  const storage = fakeStorage();
  writeVoiceMode(storage, "on");
  assert.equal(readVoiceMode(storage), "on");
  writeVoiceMode(storage, "off");
  assert.equal(readVoiceMode(storage), "off");
});

test("a storage that throws loses the preference and never the lesson", () => {
  assert.doesNotThrow(() => writeVoiceMode(hostileStorage, "on"));
  assert.doesNotThrow(() => writeVoiceMode(null, "on"));
});

// ── How fast Nemesis reads ───────────────────────────────────────────────────────────────────
//
// 🔴 THOSE TESTS MOVED TO `playback.test.ts` WITH THE THING THEY TEST (§48). Reading speed is no
// longer a preference this module owns: it is the audio element's `playbackRate`, applied to audio
// that already exists, so it can never regenerate anything.
