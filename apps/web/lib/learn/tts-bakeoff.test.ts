// The bake-off's one job: never let a datasheet decide.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a field of one has no winner`. It is the rule that stops a
// default being laundered into a measurement — rate the provider you already use, see a 4, and
// suddenly the table says the locale is decided.

import assert from "node:assert/strict";
import test from "node:test";

import {
  isCompleteRating,
  PROVIDER_CATALOGUE,
  promotionLine,
  RATING_AXES,
  ratingMean,
  sampleCostUsd,
  winnerFor,
  type BakeoffProvider,
  type BakeoffRating,
  type RatedSample,
} from "./tts-bakeoff";

function rating(score: number, over: Partial<BakeoffRating> = {}): BakeoffRating {
  return { ...Object.fromEntries(RATING_AXES.map((axis) => [axis, score])), ...over } as BakeoffRating;
}

function rated(provider: BakeoffProvider, locale: string, score: number): RatedSample {
  return {
    rating: rating(score),
    sample: { chars: 40, latencyMs: 300, locale, phrase: "¿Dónde está la biblioteca?", provider },
  };
}

test("🔴 a field of one has no winner, however well it scored", () => {
  const result = winnerFor("es-MX", [rated("xai", "es-MX", 5)]);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "only-one-provider-rated");
});

test("nothing rated is its own refusal, distinct from a field of one", () => {
  const result = winnerFor("ja-JP", [rated("xai", "es-MX", 5)]);
  assert.equal(result.ok === false && result.reason, "nothing-rated");
});

test("a real comparison produces a winner with the count of ratings behind it", () => {
  const result = winnerFor("es-MX", [
    rated("xai", "es-MX", 3),
    rated("cartesia", "es-MX", 5),
    rated("cartesia", "es-MX", 4),
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.provider, "cartesia");
  assert.equal(result.ok && result.ratings, 2);
  assert.equal(result.ok && result.mean, 4.5);
});

test("a tie is not a winner", () => {
  const result = winnerFor("es-MX", [rated("xai", "es-MX", 4), rated("google", "es-MX", 4)]);
  assert.equal(result.ok === false && result.reason, "tied");
});

test("🔴 locales are decided separately, because the winner is a per-locale fact", () => {
  const rows = [
    rated("xai", "es-MX", 5), rated("cartesia", "es-MX", 3),
    rated("xai", "ja-JP", 2), rated("cartesia", "ja-JP", 5),
  ];
  assert.equal(winnerFor("es-MX", rows).ok && (winnerFor("es-MX", rows) as { provider: string }).provider, "xai");
  assert.equal(winnerFor("ja-JP", rows).ok && (winnerFor("ja-JP", rows) as { provider: string }).provider, "cartesia");
});

test("🔴 no vendor claim is in the inputs to a winner", () => {
  // `winnerFor` takes ratings and nothing else. If a catalogue argument ever appears here, coverage
  // counts and prices have become inputs to a quality decision.
  assert.equal(winnerFor.length, 2, "winnerFor must take only a locale and ratings");
});

test("🔴 an unverified price prints as unknown rather than as an estimate", () => {
  // A cost column filled with plausible numbers is how a bake-off recommends a provider nobody priced.
  const sample = { chars: 1_000_000, latencyMs: 1, locale: "es-MX", phrase: "x", provider: "xai" as const };
  assert.equal(sampleCostUsd(sample), null);
  assert.equal(sampleCostUsd(sample, [{ advertisedLocales: null, keyEnv: "X", label: "x", provider: "xai", usdPerMillionChars: 4.2 }]), 4.2);
});

test("🔴 the shipped catalogue records no prices and no coverage counts", () => {
  // Both are things somebody has to read off a live page. A remembered figure is worse than a blank.
  for (const entry of PROVIDER_CATALOGUE) {
    assert.equal(entry.usdPerMillionChars, null, `${entry.provider} carries an unverified price`);
    assert.equal(entry.advertisedLocales, null, `${entry.provider} carries an unverified coverage claim`);
  }
});

test("a half-filled rating card does not count", () => {
  assert.equal(isCompleteRating(rating(4)), true);
  assert.equal(isCompleteRating({ nativeAccent: 4 }), false);
  assert.equal(isCompleteRating(rating(4, { prosody: 0 })), false);
  assert.equal(isCompleteRating(rating(4, { prosody: 6 })), false);
  assert.equal(isCompleteRating(rating(4, { prosody: 3.5 })), false);
  assert.equal(isCompleteRating(null), false);
});

test("the mean is over all five axes the owner named", () => {
  assert.deepEqual([...RATING_AXES], ["nativeAccent", "pronunciation", "prosody", "naturalness", "conversationalPacing"]);
  assert.equal(ratingMean(rating(4)), 4);
  assert.equal(ratingMean(rating(5, { prosody: 0 })), 4);
});

test("🔴 promotion is a line to paste, never a write into production", () => {
  // A lab that could repoint production speech would change what learners hear without review.
  const result = winnerFor("es-MX", [rated("xai", "es-MX", 3), rated("cartesia", "es-MX", 5)]);
  assert.match(promotionLine(result) ?? "", /"es-MX": "cartesia".*measured: 1 rating/);
  assert.equal(promotionLine({ detail: "x", ok: false, reason: "tied" }), null);
});
