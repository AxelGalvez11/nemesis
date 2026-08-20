// Turning a hundred numbers into one sentence a learner can act on.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a skipped sentence is not diagnosed as bad vowels`. A
// learner who said a different sentence has no pronunciation problem to diagnose, and naming a vowel
// in a word they never said is a correction that cannot be acted on and destroys trust in the ones
// that can. The completeness branch runs before any sound is looked at, and this proves it.

import assert from "node:assert/strict";
import { at, present } from "@/lib/test-support";
import test from "node:test";

import { EN_US_GOOD, ES_ES_MIXED, JA_JP_MIXED, WORDS_ONLY } from "./__fixtures__/azure-assessments";
import { normaliseAssessment } from "./azure/pronunciation";
import { diagnose } from "./pronunciation-diagnosis";
import { MAX_HEADLINE_WORDS, voiceProblems } from "@/lib/learn/learner-voice";

function evidence(raw: unknown, target: string, locale: string) {
  const result = normaliseAssessment({ locale, raw, target });
  assert.equal(result.ok, true);
  return result.ok ? result.evidence : null!;
}

test("🔴 the sound, the word and what was produced instead all reach the finding", () => {
  // This is the whole integration in one assertion: "72%" is not a lesson, and these four fields are.
  const result = diagnose(evidence(EN_US_GOOD, "hello world", "en-US"));
  assert.equal(result.verdict, "close");
  const finding = at(result.findings);
  assert.equal(finding.word, "world");
  assert.equal(finding.kind, "mispronounced");
  assert.equal(finding.sound?.target, "w");
  assert.equal(finding.sound?.likelyProduced, "v");
  assert.equal(finding.sound?.position, 1);
  assert.equal(finding.syllable, "wɜrld");
  assert.match(finding.says, /"world".*w came out closer to v/);
});

test("🔴 a skipped sentence is not diagnosed as bad vowels", () => {
  const half = {
    ...evidence(ES_ES_MIXED, "el perro corre rápido", "es-ES"),
    overall: { accuracy: 0.7, completeness: 0.25, overall: 0.5 },
  };
  const result = diagnose(half);
  assert.equal(result.verdict, "off-target");
  assert.equal(result.headline, "Most of the sentence was missing.");
  assert.ok(result.findings.every((finding) => finding.kind === "omitted"));
  assert.ok(result.findings.every((finding) => finding.sound === undefined), "a sound was named in a skipped sentence");
});

test("🔴 a skipped word outranks a mangled one at the same score", () => {
  // The learner has to say it at all before how they say it matters.
  const result = diagnose(evidence(ES_ES_MIXED, "el perro corre rápido", "es-ES"));
  assert.equal(at(result.findings).word, "corre");
  assert.equal(at(result.findings).kind, "omitted");
  assert.equal(result.headline, '"corre" was skipped.');
  const trill = result.findings.find((finding) => finding.word === "perro");
  assert.equal(trill?.sound?.target, "r");
  assert.equal(trill?.sound?.likelyProduced, "ɾ", "the tap the learner actually produced was dropped");
  assert.equal(trill?.syllable, "ro");
});

test("a non-Romance language diagnoses in its own script and phonemes", () => {
  const result = diagnose(evidence(JA_JP_MIXED, "ありがとうございます", "ja-JP"));
  const longVowel = result.findings.find((finding) => finding.word === "ありがとう");
  assert.equal(longVowel?.sound?.target, "toː");
  assert.equal(longVowel?.sound?.likelyProduced, "to");
  assert.equal(longVowel?.syllable, "ɡato");
  // A flat delivery is its own kind, not a low vowel score.
  assert.ok(result.findings.some((finding) => finding.kind === "monotone"));
});

test("🔴 a locale with no phonemes names the word and invents no sound", () => {
  const result = diagnose(evidence(WORDS_ONLY, "kaks õlut palun", "et-EE"));
  assert.equal(at(result.findings).word, "õlut");
  assert.equal(at(result.findings).sound, undefined);
  assert.match(at(result.findings).says, /"õlut" is the word to work on/);
});

test("a good attempt says so briefly and names nothing", () => {
  const clean = {
    ...evidence(EN_US_GOOD, "hello world", "en-US"),
    overall: { accuracy: 0.95, completeness: 1, overall: 0.95 },
    words: [{ accuracy: 0.95, errorType: "none" as const, word: "hello" }, { accuracy: 0.93, errorType: "none" as const, word: "world" }],
  };
  const result = diagnose(clean);
  assert.equal(result.verdict, "good");
  assert.equal(result.findings.length, 0);
  assert.equal(result.headline, "Every word landed.");
});

test("🔴 no word breakdown is not-assessable, never a zero", () => {
  // A provider that returned nothing about this locale has told us nothing about the learner.
  const result = diagnose({ heard: "x", locale: "cy-GB", provider: "azure", target: "x" });
  assert.equal(result.verdict, "not-assessable");
  assert.equal(result.headline, "");
});

test("findings are capped, because a list of six is a list nobody acts on", () => {
  const many = {
    heard: "a b c d e f",
    locale: "en-US",
    provider: "azure",
    target: "a b c d e f",
    words: "abcdef".split("").map((word) => ({ accuracy: 0.2, errorType: "mispronunciation" as const, word })),
  };
  assert.equal(diagnose(many).findings.length, 3);
  assert.equal(diagnose(many, { maxFindings: 1 }).findings.length, 1);
});

test("🔴 every line obeys the teacher's voice", () => {
  // No "let's", no praise, no exclamation marks, and a headline the learner reads once.
  const cases = [
    diagnose(evidence(EN_US_GOOD, "hello world", "en-US")),
    diagnose(evidence(ES_ES_MIXED, "el perro corre rápido", "es-ES")),
    diagnose(evidence(JA_JP_MIXED, "ありがとうございます", "ja-JP")),
  ];
  for (const result of cases) {
    assert.deepEqual(voiceProblems(result.headline, { maxWords: MAX_HEADLINE_WORDS }), []);
    for (const finding of result.findings) assert.deepEqual(voiceProblems(finding.says), []);
  }
});
