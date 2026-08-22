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
  ANSWER_SPEED,
  canonicalLocale,
  CANVAS_SPEED,
  isWellFormedLocale,
  MEASURED_PROVIDERS,
  providerForLocale,
  replayableLocale,
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
});

test("🔴 the target-language lane goes to Azure and the Canvas lane does not (§47)", () => {
  // 🔴 THIS ASSERTION USED TO SAY `xai` FOR BOTH, AND THE CHANGE IS THE POINT RATHER THAN A FIXUP.
  // Azure did not arrive as a migration: the Canvas lane still runs on the synthesiser that already
  // works and already has a key. What Azure has that xAI does not is a CATALOGUE — `ja-JP` mapping to
  // a voice somebody can name, and to the same one tomorrow — and naming the variety is the entire
  // thing §43 refuses to guess at.
  const language = routeSpeech({ key: "t9a", moment: TARGET, purpose: "language_learning", targetLocale: "ja-JP" });
  assert.equal(language.decision === "speak" && language.provider, "azure");

  // A correction inside a language lesson is instruction ABOUT the target language, not an example
  // of it — so it stays on the Canvas synthesiser, in the language of instruction.
  const correction = routeSpeech({
    instructionLocale: "en-GB",
    key: "t9b",
    moment: { answer: "el gato", kind: "correction", lead: "Close" },
    purpose: "language_learning",
  });
  assert.equal(correction.decision === "speak" && correction.provider, "xai");

  const canvas = routeSpeech({ key: "t9c", moment: { kind: "question", text: "What does this show?" }, purpose: "canvas" });
  assert.equal(canvas.decision === "speak" && canvas.provider, "xai");

  // 🔴 A MEASURED WINNER STILL OVERRIDES BOTH. The bake-off table is the top of the routing
  // hierarchy; §47 changed the DEFAULT for one lane, not the rule that listening beats defaults.
  assert.equal(providerForLocale("ja-JP", "target_language").provider, "azure");
  assert.equal(providerForLocale("ja-JP", "canvas").provider, "xai");
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

// ───────────────────────────────────────────────── replay (§47)

test("🔴 the phrase in the language being learned is replayable, its gloss is not", () => {
  // The asymmetry is the whole point: `el perro` is Spanish, `the dog` is English, and offering to
  // say the English one in a Mexican voice would teach an accent nobody chose.
  const pair = { id: "p1", left: "el perro", leftLocale: "es-MX", right: "the dog" };
  assert.equal(replayableLocale(pair, "el perro"), "es-MX");
  assert.equal(replayableLocale(pair, "the dog"), null);
});

test("🔴 nothing is replayable in a subject that is not a language", () => {
  const pair = { id: "p2", left: "tort", right: "a civil wrong" };
  assert.equal(replayableLocale(pair, "tort"), null);
  assert.equal(replayableLocale(pair, "a civil wrong"), null);
});

test("the match survives casing and surrounding space, and fails on a different phrase", () => {
  const pair = { id: "p3", left: "ありがとう", leftLocale: "ja-JP", right: "thank you" };
  assert.equal(replayableLocale(pair, "  ありがとう "), "ja-JP");
  assert.equal(replayableLocale(pair, "arigatou"), null);
  assert.equal(replayableLocale(undefined, "ありがとう"), null);
  assert.equal(replayableLocale(pair, "   "), null);
});

test("🔴 a locale is never inferred from the look of the words", () => {
  // Script detection would be wrong on exactly the pair most learners study: Spanish and English are
  // the same alphabet. The locale is looked up from what was recorded, never guessed.
  const unmarked = { id: "p4", left: "el gato", right: "the cat" };
  assert.equal(replayableLocale(unmarked, "el gato"), null);
});

// ── Reading a conversational answer ──────────────────────────────────────────────────────────
//
// Owner, 2026-08-20: *"why does it only read aloud during questions?"* Because every spoken moment
// was derived from the POLICY runtime, and a conversational answer is not a policy decision. Voice
// mode had a branch for a question and a branch for a correction and none at all for the thing a
// learner looks at most — the same shape as every other defect on this surface this month: the
// capability was whole, and the conversational path could not reach it.

const ANSWER: SpokenMoment = { kind: "answer", text: "A mole is a counting unit, like a dozen but much bigger." };

test("🔴🔴 a conversational answer is spoken at all", () => {
  const route = routeSpeech({ key: "a1", moment: ANSWER, purpose: "canvas" });
  assert.equal(route.decision, "speak");
  assert.equal(route.decision === "speak" && route.utterance.text, ANSWER.kind === "answer" ? ANSWER.text : "");
});

test("🔴 and at NATURAL pace, which is why it is its own kind rather than a question", () => {
  // 0.95 is a concession to working memory: a learner holding a QUESTION in mind while composing a
  // reply gains from the extra beat. An answer is being explained TO them with the text in front of
  // them. Reusing "question" would have quietly slowed every explanation the product gives.
  // Calibration: route it as a question and this reddens while the test above stays green.
  const answer = routeSpeech({ key: "a2", moment: ANSWER, purpose: "canvas" });
  const question = routeSpeech({ key: "q9", moment: QUESTION, purpose: "canvas" });
  assert.equal(answer.decision === "speak" && answer.speed, ANSWER_SPEED);
  assert.equal(question.decision === "speak" && question.speed, CANVAS_SPEED);
  assert.notEqual(ANSWER_SPEED, CANVAS_SPEED, "the two paces collapsed, so this test proves nothing");
});

test("🔴 an answer that is mostly notation is still refused, exactly like a question", () => {
  // The letter-ratio guard is not relaxed for the new kind. A synthesiser reading "$$\\int x^2$$"
  // aloud is worse than silence, and the whole point of the render work is that the LEARNER READS
  // that, rather than hearing it spelled out.
  const route = routeSpeech({ key: "a3", moment: { kind: "answer", text: "$$\\int x^2 \\, dx = \\frac{x^3}{3} + C$$" }, purpose: "canvas" });
  assert.equal(route.decision, "silent");
});


// ───────────────────────────────────────────────────────── a tag written any reasonable way

test("🔴 casing is normalised, so a learner never loses audio to a capital letter", () => {
  assert.equal(canonicalLocale("es-mx"), "es-MX");
  assert.equal(canonicalLocale("ES-MX"), "es-MX");
  assert.equal(canonicalLocale("  es-MX  "), "es-MX");
});

test("a script subtag is Titlecase and a region is upper, which is the registry's own rule", () => {
  assert.equal(canonicalLocale("zh-hans-cn"), "zh-Hans-CN");
});

test("a bare language is a tag on its own", () => {
  assert.equal(canonicalLocale("de"), "de");
});

test("🔴 normalising is not the same as accepting anything — a display name is still not a tag", () => {
  assert.equal(canonicalLocale("Mexican Spanish"), null);
  assert.equal(canonicalLocale("¿Dónde está la biblioteca?"), null);
  assert.equal(canonicalLocale(""), null);
});
