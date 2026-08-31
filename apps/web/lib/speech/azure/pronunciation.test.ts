// Azure's numbers, turned into Nemesis's.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a skipped word is absent, never a zero`. Azure reports an
// omission with an ErrorType and NO accuracy score, and the obvious normalisation — default the
// missing number to 0 — makes "did not say it" and "said it terribly" the same value. Every layer
// downstream then treats them identically: the diagnosis names a vowel in a word nobody said, and
// the progress comparison reports a huge improvement the moment the learner says it at all.
//
// 🔴 THREE LANGUAGES BECAUSE THE SHAPE DIFFERS, not for coverage theatre. See the fixtures.

import assert from "node:assert/strict";
import { at, present } from "@/lib/test-support";
import test from "node:test";

import {
  EN_US_GOOD,
  ES_ES_MIXED,
  JA_JP_MIXED,
  ES_MX_FLAT_REST,
  NO_MATCH,
  SILENCE,
  WORDS_ONLY,
} from "../__fixtures__/azure-assessments";
import { assessmentHeader, azureContentType, mapErrorType, normaliseAssessment } from "./pronunciation";

function evidenceOf(raw: unknown, target: string, locale: string) {
  const result = normaliseAssessment({ locale, raw, target });
  assert.equal(result.ok, true, `normalisation refused: ${result.ok === false ? result.detail : ""}`);
  return result.ok ? result.evidence : null!;
}

// ───────────────────────────────────────────────────────────────── the scales

test("🔴 every score arrives 0–1, never Azure's 0–100", () => {
  // One provider's scale leaking inward makes the first person to average two numbers wrong by a
  // factor of a hundred.
  const evidence = evidenceOf(EN_US_GOOD, "hello world", "en-US");
  assert.equal(evidence.overall?.accuracy, 0.88);
  assert.equal(evidence.overall?.completeness, 1);
  assert.equal(evidence.overall?.overall, 0.89);
  assert.equal(evidence.prosody?.fluency, 0.92);
  assert.equal(evidence.prosody?.prosody, 0.85);
  for (const word of evidence.words ?? []) {
    if (word.accuracy !== undefined) assert.ok(word.accuracy >= 0 && word.accuracy <= 1, `${word.word} scored ${word.accuracy}`);
  }
});

test("🔴 offsets arrive in milliseconds, not in Windows ticks", () => {
  // 100-nanosecond units are a unit nobody should meet twice; converting once at the boundary is
  // what makes "replay the sound they got wrong" a media slice rather than arithmetic everywhere.
  const evidence = evidenceOf(EN_US_GOOD, "hello world", "en-US");
  const hello = evidence.words?.[0];
  assert.equal(hello?.startMs, 300);
  assert.equal(hello?.durationMs, 500);
  assert.equal(at(hello?.phonemes).startMs, 300);
});

// ───────────────────────────────────────────────────────────────── the load-bearing distinction

test("🔴 a skipped word is absent, never a zero", () => {
  const evidence = evidenceOf(ES_ES_MIXED, "el perro corre rápido", "es-ES");
  const skipped = evidence.words?.find((word) => word.word === "corre");
  assert.ok(skipped, "the omitted word was dropped from the result entirely");
  assert.equal(skipped.errorType, "omission");
  assert.equal(skipped.accuracy, undefined, "an omission was given a score it never had");
});

test("🔴 an unrecognised error type is unclassified, never none", () => {
  // Azure adds error types. Mapping an unknown one to "nothing wrong" silently marks a learner
  // correct on whatever Microsoft ships next.
  assert.equal(mapErrorType("Mispronunciation"), "mispronunciation");
  assert.equal(mapErrorType("UnexpectedBreak"), "unexpected-break");
  assert.equal(mapErrorType("Monotone"), "monotone");
  assert.equal(mapErrorType(undefined), "none");
  assert.equal(mapErrorType("SomethingMicrosoftShipsIn2027"), "unclassified");
});

// ───────────────────────────────────────────────────────────────── what the learner produced

test("🔴 the alternative phoneme survives, because it is the only half a learner cannot work out", () => {
  const evidence = evidenceOf(EN_US_GOOD, "hello world", "en-US");
  const world = evidence.words?.find((word) => word.word === "world");
  const w = world?.phonemes?.[0];
  assert.equal(w?.phoneme, "w");
  assert.equal(w?.accuracy, 0.41);
  assert.equal(at(w?.likelyProduced).phoneme, "v");
  assert.equal(at(w?.likelyProduced).score, 0.71);
});

test("a correct sound does not report itself as an alternative", () => {
  // Azure leads its NBest list with the expected phoneme on a correct sound, and "you produced /a/
  // instead of /a/" is noise that hides the useful case.
  const result = normaliseAssessment({
    locale: "en-US",
    raw: {
      NBest: [
        {
          Display: "a",
          PronunciationAssessment: { AccuracyScore: 99 },
          Words: [
            {
              Phonemes: [
                { Phoneme: "eɪ", PronunciationAssessment: { AccuracyScore: 99, NBestPhonemes: [{ Phoneme: "eɪ", Score: 99 }] } },
              ],
              PronunciationAssessment: { AccuracyScore: 99, ErrorType: "None" },
              Word: "a",
            },
          ],
        },
      ],
      RecognitionStatus: "Success",
    },
    target: "a",
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && at(at(result.evidence.words).phonemes).likelyProduced, undefined);
});

// ───────────────────────────────────────────────────────────────── languages that are not English

test("Spanish keeps its syllables, so a correction can name one", () => {
  const evidence = evidenceOf(ES_ES_MIXED, "el perro corre rápido", "es-ES");
  const perro = evidence.words?.find((word) => word.word === "perro");
  assert.deepEqual(perro?.syllables?.map((syllable) => syllable.syllable), ["pe", "ro"]);
  assert.equal(at(perro?.syllables, 1).accuracy, 0.34);
  assert.equal(at(perro?.syllables, 1).grapheme, "rro");
});

test("🔴 Japanese survives a parser that could have assumed Latin script", () => {
  // Its "words" are morphemes whose graphemes and phonemes have no letter-by-letter relationship, and
  // the whole payload arrives in kana. Nothing here may index into a string.
  const evidence = evidenceOf(JA_JP_MIXED, "ありがとうございます", "ja-JP");
  assert.equal(evidence.words?.length, 2);
  assert.equal(at(evidence.words).word, "ありがとう");
  assert.equal(at(at(evidence.words).syllables).grapheme, "あり");
  const longVowel = at(evidence.words).phonemes?.find((phoneme) => phoneme.phoneme === "toː");
  assert.equal(at(longVowel?.likelyProduced).phoneme, "to");
  assert.equal(at(evidence.words, 1).errorType, "monotone");
});

test("a locale with no phonemes returns words and invents no sounds", () => {
  const evidence = evidenceOf(WORDS_ONLY, "kaks õlut palun", "et-EE");
  assert.equal(evidence.words?.length, 3);
  assert.equal(at(evidence.words, 1).accuracy, 0.44);
  assert.equal(at(evidence.words, 1).phonemes, undefined);
  assert.equal(at(evidence.words, 1).syllables, undefined);
});

// ───────────────────────────────────────────────────────────────── the refusals

test("🔴 each recognition status becomes a different thing to say", () => {
  // Telling somebody who said nothing that the system is broken sends them to retry the wrong fix.
  const noMatch = normaliseAssessment({ locale: "en-US", raw: NO_MATCH, target: "hello" });
  assert.equal(noMatch.ok === false && noMatch.reason, "off-target");
  const silence = normaliseAssessment({ locale: "en-US", raw: SILENCE, target: "hello" });
  assert.equal(silence.ok === false && silence.reason, "nothing-heard");
  const rubbish = normaliseAssessment({ locale: "en-US", raw: "not json", target: "hello" });
  assert.equal(rubbish.ok === false && rubbish.reason, "provider-error");
  const empty = normaliseAssessment({ locale: "en-US", raw: { NBest: [], RecognitionStatus: "Success" }, target: "hello" });
  assert.equal(empty.ok === false && empty.reason, "nothing-heard");
});

test("the raw payload is kept only when asked for", () => {
  assert.equal(evidenceOf(EN_US_GOOD, "hello world", "en-US").raw, undefined);
  const kept = normaliseAssessment({ keepRaw: true, locale: "en-US", raw: EN_US_GOOD, target: "hello world" });
  assert.ok(kept.ok && kept.evidence.raw === EN_US_GOOD);
});

// ───────────────────────────────────────────────────────────────── the request side

test("🔴 the assessment header is base64 UTF-8, so a non-Latin reference survives it", () => {
  // `btoa` would mangle any reference text outside Latin-1, which is most of the languages this
  // feature exists for.
  const header = assessmentHeader({ referenceText: "ありがとうございます" });
  const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8"));
  assert.equal(decoded.ReferenceText, "ありがとうございます");
  assert.equal(decoded.Granularity, "Phoneme");
  assert.equal(decoded.PhonemeAlphabet, "IPA");
  assert.equal(decoded.EnableMiscue, true, "miscue off makes a skipped word invisible");
  assert.ok(decoded.NBestPhonemeCount >= 1, "no alternatives means no teachable correction");
});

test("only formats the assessor accepts are sent", () => {
  assert.match(azureContentType("audio/webm;codecs=opus") ?? "", /webm/);
  assert.match(azureContentType("audio/wav") ?? "", /wav/);
  // Safari's MediaRecorder output. Refused by name so the failure is diagnosable.
  assert.equal(azureContentType("audio/mp4"), null);
  assert.equal(azureContentType("video/webm"), null);
});

// ─────────────────────────────────────────────── the shape production returns

test("🔴🔴 the REST short-audio shape — scores flat, no wrapper — yields the same evidence", () => {
  // Calibration: make assessmentOf read ONLY the nested `PronunciationAssessment`
  // shape again and every assertion here reddens — which is exactly what the
  // deployed scorer was doing until speech-live run 3 caught it: undefined
  // scores, ErrorType "", and "Every word landed" for a different sentence.
  const evidence = evidenceOf(ES_MX_FLAT_REST, "El perro corre rápido por el parque.", "es-MX");
  assert.equal(evidence.overall?.overall, 0.968);
  assert.equal(evidence.overall?.accuracy, 0.96);
  assert.equal(evidence.overall?.completeness, 1);
  assert.equal(evidence.prosody?.fluency, 0.98);
  assert.equal(at(evidence.words, 0).accuracy, 1);
  assert.equal(at(evidence.words, 2).errorType, "mispronunciation");
  // The omitted word still has NO score — flat parsing must not invent one.
  assert.equal(at(evidence.words, 6).errorType, "omission");
  assert.equal(at(evidence.words, 6).accuracy, undefined);
});

test("a plain recognition node without assessment fields still yields no scores", () => {
  // The flat fallback reads the node itself; a node that never carried
  // assessment fields must parse exactly as it always did.
  const bare = {
    DisplayText: "hello.",
    NBest: [{ Confidence: 0.9, Display: "hello.", Lexical: "hello", Words: [{ Duration: 1_000_000, Offset: 0, Word: "hello" }] }],
    RecognitionStatus: "Success",
  };
  const evidence = evidenceOf(bare, "hello", "en-US");
  assert.equal(evidence.overall, undefined);
  assert.equal(at(evidence.words, 0).accuracy, undefined);
  assert.equal(at(evidence.words, 0).errorType, "none");
});
