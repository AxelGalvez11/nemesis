import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CANVAS_VOICES } from "@/lib/learn/canvas-voices";
import {
  DEFAULT_READING_VOICE,
  LEGACY_CANVAS_VOICE_KEY,
  READING_VOICE_KEY,
  readReadingVoice,
  sameVoice,
  writeReadingVoice,
  XAI_READING_VOICES,
} from "./reading-voice";

// ── The voice, chosen once, in Settings ──────────────────────────────────────────────────────
//
// Owner, 2026-08-22: *"Voice selection should live in Settings as a persistent user preference…
// The selected voice should persist for that user and be used everywhere Nemesis reads content
// aloud. Canvas should not make the user repeatedly choose a voice."*

function fakeStorage(seed: Record<string, string> = {}) {
  const store = new Map(Object.entries(seed));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  };
}

test("🔴 the default is what every canvas has always spoken in", () => {
  // Changing the default in the same change that moves the picker would silently re-voice the
  // product for everybody who never asked for anything.
  assert.equal(DEFAULT_READING_VOICE.id, "eve");
  assert.equal(DEFAULT_READING_VOICE.provider, "xai");
});

test("🔴🔴 every offered xAI voice is one the probe actually confirmed", () => {
  // The list is a MEASUREMENT: an id nobody probed answers 502, and to the learner that is
  // indistinguishable from voice being broken. See `lib/learn/canvas-voices.ts`.
  assert.deepEqual(
    XAI_READING_VOICES.map((voice) => voice.id),
    CANVAS_VOICES.map((voice) => voice.id),
  );
  assert.ok(XAI_READING_VOICES.every((voice) => voice.provider === "xai"));
});

test("🔴🔴 the provider RIDES ON the voice, so there is no second setting to disagree with it", () => {
  // This is what makes "only the selected provider is involved" structural rather than a promise:
  // picking a voice picks a synthesiser, in one field, with nothing else to fall out of step.
  // Calibration: add a standalone provider preference and this reddens.
  const SOURCE = readFileSync(new URL("./reading-voice.ts", import.meta.url), "utf8");
  assert.ok(!/PROVIDER_KEY|readProvider|writeProvider/.test(SOURCE), "a separate provider setting exists");
  for (const voice of XAI_READING_VOICES) assert.ok(voice.provider, `${voice.id} names no provider`);
});

test("a choice survives the round trip, which is what 'persists across sessions' means", () => {
  const storage = fakeStorage();
  const ara = XAI_READING_VOICES.find((voice) => voice.id === "ara")!;
  writeReadingVoice(storage, ara);
  assert.deepEqual(readReadingVoice(storage), ara);

  const azure = { id: "en-US-AvaMultilingualNeural", label: "Ava", locale: "en-US", provider: "azure" as const };
  writeReadingVoice(storage, azure);
  const back = readReadingVoice(storage);
  assert.equal(back.id, azure.id);
  assert.equal(back.provider, "azure");
  assert.equal(back.locale, "en-US");
});

test("🔴🔴 the Canvas-era choice is carried over rather than reset", () => {
  // Somebody who picked Ara in the Canvas menu last week must not silently become Eve because the
  // setting moved house. Calibration: drop the legacy read and this reddens.
  const storage = fakeStorage({ [LEGACY_CANVAS_VOICE_KEY]: "rex" });
  assert.equal(readReadingVoice(storage).id, "rex");
  assert.equal(readReadingVoice(storage).provider, "xai");
  // An old key holding an id nobody offers still resolves to the default rather than being sent.
  assert.equal(readReadingVoice(fakeStorage({ [LEGACY_CANVAS_VOICE_KEY]: "ani" })).id, "eve");
});

test("🔴🔴 an unusable stored voice resolves to the default rather than being sent", () => {
  // Both providers answer an unknown id with an error, and to the learner that is indistinguishable
  // from voice being broken — while the setting that caused it is in another part of the app.
  const cases = [
    "not json at all",
    JSON.stringify({ id: "eve" }),
    JSON.stringify({ id: "no-such-voice", provider: "xai" }),
    JSON.stringify({ id: "en-US-AvaMultilingualNeural", provider: "azure" }),
    JSON.stringify({ id: "'; DROP TABLE", locale: "en-US", provider: "azure" }),
    JSON.stringify({ provider: "azure" }),
  ];
  for (const raw of cases) {
    const back = readReadingVoice(fakeStorage({ [READING_VOICE_KEY]: raw }));
    assert.deepEqual(back, DEFAULT_READING_VOICE, `an unusable value was trusted: ${raw}`);
  }
});

test("🔴 an Azure voice with no locale is refused, because the route refuses it", () => {
  // `/api/speech/tts` requires a locale, deliberately. A stored Azure voice without one would be
  // refused on every single utterance, silently, for as long as it stayed selected.
  const back = readReadingVoice(fakeStorage({
    [READING_VOICE_KEY]: JSON.stringify({ id: "en-US-AvaMultilingualNeural", provider: "azure" }),
  }));
  assert.equal(back.provider, "xai");
});

test("a storage that throws loses the preference and never the lesson", () => {
  const angry = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(readReadingVoice(angry), DEFAULT_READING_VOICE);
  assert.doesNotThrow(() => writeReadingVoice(angry, DEFAULT_READING_VOICE));
  assert.deepEqual(readReadingVoice(null), DEFAULT_READING_VOICE);
});

test("two voices are the same only when both provider and id match", () => {
  const ava = { id: "x", label: "x", locale: "en-US", provider: "azure" as const };
  assert.ok(sameVoice(ava, { ...ava, label: "renamed" }));
  assert.ok(!sameVoice(ava, { ...ava, provider: "xai" }));
  assert.ok(!sameVoice(null, ava));
});
