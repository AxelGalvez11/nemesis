import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_VOICE_MODE,
  readAutoDictation,
  readVoiceMode,
  shouldAskAboutAutoDictation,
  shouldOpenDictation,
  writeAutoDictation,
  writeVoiceMode,
  type AutoDictation,
  DEFAULT_VOICE_SPEED,
  nextVoiceSpeed,
  readVoiceSpeed,
  VOICE_SPEEDS,
} from "./voice-preferences";

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

test("auto-dictation starts UNASKED, which is not the same as refused", () => {
  assert.equal(readAutoDictation(fakeStorage()), "unasked");
  assert.equal(readAutoDictation(null), "unasked");
});

test("🔴 an unreadable or unknown stored value reads as unasked, never as 'off'", () => {
  // The safe direction is asking again. Treating a value written by an older build as a refusal
  // silently decides on the learner's behalf that they said no.
  assert.equal(readAutoDictation(fakeStorage({ "nemesis.voice.autoDictation": "yes" })), "unasked");
  assert.equal(readAutoDictation(hostileStorage), "unasked");
});

test("both preferences round-trip", () => {
  for (const value of ["on", "off", "unasked"] as AutoDictation[]) {
    const storage = fakeStorage();
    writeAutoDictation(storage, value);
    assert.equal(readAutoDictation(storage), value);
  }
  const storage = fakeStorage();
  writeVoiceMode(storage, "on");
  assert.equal(readVoiceMode(storage), "on");
  writeVoiceMode(storage, "off");
  assert.equal(readVoiceMode(storage), "off");
});

test("a storage that throws loses the preference and never the lesson", () => {
  assert.doesNotThrow(() => writeAutoDictation(hostileStorage, "on"));
  assert.doesNotThrow(() => writeVoiceMode(hostileStorage, "on"));
  assert.doesNotThrow(() => writeAutoDictation(null, "on"));
});

test("the ask appears exactly once, and only where it means something", () => {
  const supported = { autoDictation: "unasked" as AutoDictation, dictationSupported: true };
  assert.equal(shouldAskAboutAutoDictation({ ...supported, voiceMode: "on" }), true);
  // Meaningless with voice off: Nemesis never finishes speaking, so there is no moment to open at.
  assert.equal(shouldAskAboutAutoDictation({ ...supported, voiceMode: "off" }), false);
  // Answered — either way — is not asked again.
  assert.equal(shouldAskAboutAutoDictation({ ...supported, autoDictation: "on", voiceMode: "on" }), false);
  assert.equal(shouldAskAboutAutoDictation({ ...supported, autoDictation: "off", voiceMode: "on" }), false);
  // Offering to auto-open a microphone that cannot listen is a promise we cannot keep.
  assert.equal(
    shouldAskAboutAutoDictation({ ...supported, dictationSupported: false, voiceMode: "on" }),
    false,
  );
});

test("the microphone opens only after a question, and only when asked for", () => {
  const base = {
    autoDictation: "on" as AutoDictation,
    composerBusy: false,
    dictationSupported: true,
    moment: "question" as const,
    voiceMode: "on" as const,
  };
  assert.equal(shouldOpenDictation(base), true);
  // 🔴 Never after a correction: that would be listening for an answer to something the learner
  // was just told.
  assert.equal(shouldOpenDictation({ ...base, moment: "correction" }), false);
  assert.equal(shouldOpenDictation({ ...base, autoDictation: "off" }), false);
  assert.equal(shouldOpenDictation({ ...base, autoDictation: "unasked" }), false);
  assert.equal(shouldOpenDictation({ ...base, voiceMode: "off" }), false);
  assert.equal(shouldOpenDictation({ ...base, dictationSupported: false }), false);
  // Already listening, or already holding text being worked on — reopening interrupts them.
  assert.equal(shouldOpenDictation({ ...base, composerBusy: true }), false);
});

test("🔴 switching voice mode off mid-utterance stops the microphone opening after it", () => {
  // Every condition is read at the moment of use rather than latched when speech began. A learner
  // who switched voice off one second ago is telling us not to open a microphone now.
  const listening = {
    autoDictation: "on" as AutoDictation,
    composerBusy: false,
    dictationSupported: true,
    moment: "question" as const,
  };
  assert.equal(shouldOpenDictation({ ...listening, voiceMode: "on" }), true);
  assert.equal(shouldOpenDictation({ ...listening, voiceMode: "off" }), false);
});

// ── How fast Nemesis reads ───────────────────────────────────────────────────────────────────

test("🔴 the speed cycles through its three steps and wraps", () => {
  assert.equal(nextVoiceSpeed(1), 1.5);
  assert.equal(nextVoiceSpeed(1.5), 2);
  assert.equal(nextVoiceSpeed(2), 1, "the cycle does not wrap, so the control is a dead end at 2x");
});

test("🔴 nothing below 1, and that is a decision rather than an oversight", () => {
  // Voice already runs a QUESTION at 0.95 as a concession to working memory, and that belongs to
  // the moment rather than to a preference: a learner who slows every utterance down is training
  // on a rhythm nobody speaks. Calibration: add 0.75 to VOICE_SPEEDS and this reddens.
  assert.ok(VOICE_SPEEDS.every((s) => s >= 1), `a speed below natural is offered: ${VOICE_SPEEDS.join(", ")}`);
});

test("🔴 a stored value outside the list falls back rather than being trusted", () => {
  // A hand-edited "4" would otherwise read every answer at quadruple speed with nothing to say why.
  const at = (value: string) => readVoiceSpeed({ getItem: () => value });
  assert.equal(at("4"), DEFAULT_VOICE_SPEED);
  assert.equal(at("nonsense"), DEFAULT_VOICE_SPEED);
  assert.equal(at("1.5"), 1.5, "a legitimate stored value is being thrown away");
});
