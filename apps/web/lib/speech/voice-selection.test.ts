// Choosing a voice, and refusing to guess a variety.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `the same locale gives the same voice every time`. A learner
// drilling one sentence hears the target four times; if the voice changes between attempts they are
// comparing their production against a moving target, and any progress they hear might be the voice.
// A selector with a "pick the best" heuristic that depends on catalogue ORDER would pass every other
// test here and fail this one silently the first time Azure reorders its response.

import assert from "node:assert/strict";
import test from "node:test";

import { AZURE_VOICE_LIST } from "./__fixtures__/azure-voices";
import { normaliseVoiceList } from "./azure/voice-catalog";
import { selectVoice, supportedLocales } from "./voice-selection";

const CATALOGUE = normaliseVoiceList(AZURE_VOICE_LIST, "2026-08-19T00:00:00.000Z").voices;

function chosen(request: Parameters<typeof selectVoice>[1]) {
  const result = selectVoice(CATALOGUE, request);
  assert.equal(result.ok, true, `refused: ${result.ok === false ? result.detail : ""}`);
  return result.ok ? result.choice : null!;
}

test("🔴 the same locale gives the same voice every time, including after a reshuffle", () => {
  const first = chosen({ locale: "es-MX" });
  const shuffled = [...CATALOGUE].reverse();
  const second = selectVoice(shuffled, { locale: "es-MX" });
  assert.ok(second.ok);
  assert.equal(second.ok && second.choice.voice.shortName, first.voice.shortName);
});

test("🔴 a Mexican lesson does not get a Castilian voice by accident", () => {
  // §43's whole argument: `es-MX` and `es-ES` differ in exactly what is being taught, and a silent
  // substitution is invisible to the learner and to us.
  const mexican = chosen({ locale: "es-MX" });
  assert.equal(mexican.voice.locale, "es-MX");
  assert.equal(mexican.match, "exact");
  const spanish = chosen({ locale: "es-ES" });
  assert.equal(spanish.voice.locale, "es-ES");
});

test("🔴 a region with no voice refuses rather than silently substituting one", () => {
  const refused = selectVoice(CATALOGUE, { locale: "es-AR" });
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.reason, "no-voice-matches");
  // And with fallback allowed it substitutes, says so, and names what it did.
  const allowed = chosen({ allowRegionFallback: true, locale: "es-AR" });
  assert.equal(allowed.match, "region-fallback");
  assert.match(allowed.because, /no es-AR voice exists/);
});

test("a language Azure does not speak at all is its own refusal", () => {
  const result = selectVoice(CATALOGUE, { allowRegionFallback: true, locale: "cy-GB" });
  // The multilingual voice lists cy-GB as a secondary, so this one is served rather than refused —
  // which is the entire reason secondary locales are parsed.
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.choice.match, "secondary-locale");

  const nowhere = selectVoice(CATALOGUE, { allowRegionFallback: true, locale: "kl-GL" });
  assert.equal(nowhere.ok === false && nowhere.reason, "locale-unsupported");
});

test("a preview voice never wins over a generally available one", () => {
  const mexican = chosen({ locale: "es-MX" });
  assert.equal(mexican.voice.preview, false);
  assert.ok(CATALOGUE.some((voice) => voice.preview), "the fixture stopped containing a preview voice");
});

test("🔴 a retired standard voice is never selected", () => {
  const english = chosen({ locale: "en-US" });
  assert.equal(english.voice.neural, true);
  assert.notEqual(english.voice.shortName, "en-US-ZiraRUS");
});

test("gender and style filter, and an impossible combination is named", () => {
  assert.equal(chosen({ gender: "male", locale: "es-MX" }).voice.shortName, "es-MX-JorgeNeural");
  assert.equal(chosen({ locale: "ja-JP", style: "cheerful" }).voice.shortName, "ja-JP-NanamiNeural");
  const impossible = selectVoice(CATALOGUE, { locale: "ja-JP", style: "newscast" });
  assert.equal(impossible.ok === false && impossible.reason, "no-voice-matches");
});

test("an explicitly named voice wins over every rule", () => {
  const named = chosen({ locale: "es-MX", shortName: "es-MX-BeatrizNeural" });
  assert.equal(named.voice.shortName, "es-MX-BeatrizNeural");
  assert.equal(named.voice.preview, true, "an explicit choice was overridden by the preview rule");
  const missing = selectVoice(CATALOGUE, { locale: "es-MX", shortName: "es-MX-NobodyNeural" });
  assert.equal(missing.ok === false && missing.reason, "no-voice-matches");
});

test("a locale that is not a tag is refused before anything is searched", () => {
  const result = selectVoice(CATALOGUE, { locale: "Spanish (Mexico)" });
  assert.equal(result.ok === false && result.reason, "locale-malformed");
});

test("an empty catalogue is its own reason, not a missing voice", () => {
  const result = selectVoice([], { locale: "en-US" });
  assert.equal(result.ok === false && result.reason, "catalogue-empty");
});

test("a choice carries alternatives, so a picker has something to offer", () => {
  const english = chosen({ locale: "en-US" });
  assert.ok(english.alternatives.length >= 2);
  assert.ok(english.alternatives.every((voice) => voice.shortName !== english.voice.shortName));
});

test("the supported-locale list counts neural voices per locale", () => {
  const locales = supportedLocales(CATALOGUE);
  const mexican = locales.find((entry) => entry.locale === "es-MX");
  // Three: two GA and one preview. A preview voice IS available for this locale — it simply never
  // wins the automatic choice — and excluding it here would under-report what a picker can offer.
  assert.equal(mexican?.voices, 3, "the neural filter slipped, or a preview voice was dropped");
  assert.equal(locales.find((entry) => entry.locale === "en-US")?.voices, 4, "the retired standard voice was counted");
  assert.equal(mexican?.localeName, "Spanish (Mexico)");
  assert.deepEqual(
    locales.map((entry) => entry.locale),
    [...locales.map((entry) => entry.locale)].sort((a, b) => a.localeCompare(b, "en")),
  );
});
