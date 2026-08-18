// The two lanes, and the rule that keeps them apart.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a target-language utterance is refused without a locale`.
// Everything else is coverage. That one guards the failure that is invisible from the outside: a
// learner studying Mexican Spanish, taught in whatever variety a provider picked, with nothing on
// screen or in a log to say it happened.

import assert from "node:assert/strict";
import test from "node:test";

import type { SpokenMoment } from "./canvas-speech";
import {
  CANVAS_SPEED,
  isWellFormedLocale,
  MEASURED_PROVIDERS,
  routeSpeech,
  TARGET_LANGUAGE_SPEED,
} from "./speech-route";

const QUESTION: SpokenMoment = { kind: "question", text: "Which structure filters the blood first?" };
const CORRECTION: SpokenMoment = { answer: "The glomerulus.", kind: "correction", lead: "You had part of this" };
const TARGET: SpokenMoment = { kind: "target_language", text: "¿Dónde está la biblioteca?" };

// ───────────────────────────────────────────────────────── the canvas lane is unchanged

test("🔴 an ordinary canvas question routes exactly as it did before §43", () => {
  const route = routeSpeech({ key: "q1", moment: QUESTION, purpose: "canvas" });
  assert.equal(route.decision, "speak");
  assert.equal(route.decision === "speak" && route.locale, "auto");
  assert.equal(route.decision === "speak" && route.speed, CANVAS_SPEED);
  assert.equal(route.decision === "speak" && route.utterance.text, QUESTION.kind === "question" ? QUESTION.text : "");
});

test("a correction keeps its verdict, so hearing it still tells the learner they were partly right", () => {
  const route = routeSpeech({ key: "c1", moment: CORRECTION, purpose: "canvas" });
  assert.equal(route.decision, "speak");
  assert.match(route.decision === "speak" ? route.utterance.text : "", /^You had part of this\. The glomerulus\.$/);
});

test("a canvas refusal keeps its own reason rather than becoming a generic silence", () => {
  const route = routeSpeech({
    key: "q2",
    moment: { kind: "question", text: "$$\\int_0^1 x^2\\,dx$$" },
    purpose: "canvas",
  });
  assert.equal(route.decision, "silent");
  assert.equal(route.decision === "silent" && route.reason, "notation-not-speakable");
});

test("an instruction locale is sent when the caller knows it", () => {
  const route = routeSpeech({ instructionLocale: "es-ES", key: "q3", moment: QUESTION, purpose: "canvas" });
  assert.equal(route.decision === "speak" && route.locale, "es-ES");
});

test("a locale that is not a tag is refused rather than sent and ignored", () => {
  const route = routeSpeech({ instructionLocale: "Mexican Spanish", key: "q4", moment: QUESTION, purpose: "canvas" });
  assert.equal(route.decision, "silent");
  assert.equal(route.decision === "silent" && route.reason, "locale-malformed");
});

// ───────────────────────────────────────────────────────── the language lane inverts the rules

test("🔴 a target-language utterance is refused without a locale, not spoken in a guessed variety", () => {
  // The whole point. Falling back to `auto` produces fluent audio in whichever Spanish the provider
  // felt like, and neither the learner nor a log could tell it was the wrong one.
  const route = routeSpeech({ key: "t1", moment: TARGET, purpose: "language_learning" });
  assert.equal(route.decision, "silent");
  assert.equal(route.decision === "silent" && route.reason, "locale-unknown");
});

test("🔴 `auto` is treated as no locale at all, because that is what it is", () => {
  const route = routeSpeech({ key: "t2", moment: TARGET, purpose: "language_learning", targetLocale: "auto" });
  assert.equal(route.decision === "silent" && route.reason, "locale-unknown");
});

test("with a locale established, the utterance is spoken in it at natural pace", () => {
  const route = routeSpeech({ key: "t3", moment: TARGET, purpose: "language_learning", targetLocale: "es-MX" });
  assert.equal(route.decision, "speak");
  assert.equal(route.decision === "speak" && route.locale, "es-MX");
  assert.equal(route.decision === "speak" && route.speed, TARGET_LANGUAGE_SPEED);
});

test("🔴 two varieties of one language are different routes, which is the distinction being taught", () => {
  const mx = routeSpeech({ key: "t4", moment: TARGET, purpose: "language_learning", targetLocale: "es-MX" });
  const es = routeSpeech({ key: "t4", moment: TARGET, purpose: "language_learning", targetLocale: "es-ES" });
  assert.notEqual(mx.decision === "speak" && mx.locale, es.decision === "speak" && es.locale);
});

test("🔴 a short drill framed in punctuation survives, where the canvas notation rule would refuse it", () => {
  // "¿Sí?" is two letters in four characters. The letter-ratio heuristic exists for teaching prose
  // and rejects exactly the shortest and most useful pronunciation drills.
  const route = routeSpeech({
    key: "t5",
    moment: { kind: "target_language", text: "¿Sí?" },
    purpose: "language_learning",
    targetLocale: "es-MX",
  });
  assert.equal(route.decision, "speak");
});

test("a Japanese line framed in corner brackets survives the same way", () => {
  const route = routeSpeech({
    key: "t6",
    moment: { kind: "target_language", text: "「はい」" },
    purpose: "language_learning",
    targetLocale: "ja-JP",
  });
  assert.equal(route.decision, "speak");
});

test("notation is still refused in the language lane, because a formula is unspeakable in any language", () => {
  const route = routeSpeech({
    key: "t7",
    moment: { kind: "target_language", text: "\\frac{1}{2}" },
    purpose: "language_learning",
    targetLocale: "es-MX",
  });
  assert.equal(route.decision, "silent");
  assert.equal(route.decision === "silent" && route.reason, "notation-not-speakable");
});

test("🔴 a correction inside a language lesson is spoken in the language of instruction, not the target", () => {
  // "Almost — the stress falls on the last syllable" read in a Mexican accent is not a teaching
  // decision anybody made.
  const route = routeSpeech({
    instructionLocale: "en-GB",
    key: "c2",
    moment: CORRECTION,
    purpose: "language_learning",
    targetLocale: "es-MX",
  });
  assert.equal(route.decision === "speak" && route.locale, "en-GB");
  assert.equal(route.decision === "speak" && route.speed, CANVAS_SPEED);
});

test("🔴 a target-language moment outside a language session is silent, not synthesised", () => {
  const route = routeSpeech({ key: "t8", moment: TARGET, purpose: "canvas", targetLocale: "es-MX" });
  assert.equal(route.decision, "silent");
  assert.equal(route.decision === "silent" && route.reason, "not-a-spoken-moment");
});

// ───────────────────────────────────────────────────────── the provider layer

test("🔴 every locale reports its provider as unmeasured until a bake-off has actually run", () => {
  assert.deepEqual(MEASURED_PROVIDERS, {}, "a provider table filled from vendor claims is the failure §43 names");
  const route = routeSpeech({ key: "t9", moment: TARGET, purpose: "language_learning", targetLocale: "ja-JP" });
  assert.equal(route.decision === "speak" && route.providerEvidence, "unmeasured-default");
  assert.equal(route.decision === "speak" && route.provider, "xai");
});

// ───────────────────────────────────────────────────────── locale shape

test("locale shapes accepted and refused", () => {
  for (const good of ["es", "es-MX", "pt-BR", "zh-Hans-CN", "ja-JP", "es-419"]) {
    assert.equal(isWellFormedLocale(good), true, `${good} should be a tag`);
  }
  for (const bad of ["", "Spanish", "es_MX", "es-mx", "ES-MX", "es-MEX", "a"]) {
    assert.equal(isWellFormedLocale(bad), false, `${bad} should not be a tag`);
  }
});
