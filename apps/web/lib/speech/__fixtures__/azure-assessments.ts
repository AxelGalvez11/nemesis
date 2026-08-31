// Azure pronunciation-assessment responses, in the exact shape the REST endpoint returns.
//
// 🔴 THREE LANGUAGES BECAUSE THE SHAPE GENUINELY DIFFERS BETWEEN THEM, not for coverage theatre.
// English returns IPA phonemes and syllables; Spanish returns phonemes with a different alphabet and
// a mispronunciation the assessor can name; Japanese is non-Romance, arrives in a different script,
// and — this is the part a Latin-alphabet-shaped parser gets wrong — its "words" are morphemes
// whose graphemes and phonemes have no letter-by-letter relationship at all.
//
// 🔴 TICKS, NOT MILLISECONDS. `Offset` and `Duration` are in 100-nanosecond units throughout, which
// is the unit conversion most likely to be silently wrong in a hundred places if it is not done once
// at the boundary. The numbers here are realistic, so a test asserting 350ms is asserting arithmetic
// rather than a constant somebody made up.

/** en-US, "hello world", said well apart from one weak /w/. */
export const EN_US_GOOD: unknown = {
  Duration: 11_600_000,
  DisplayText: "Hello world.",
  NBest: [
    {
      Confidence: 0.94,
      Display: "Hello world.",
      ITN: "hello world",
      Lexical: "hello world",
      MaskedITN: "hello world",
      PronunciationAssessment: {
        AccuracyScore: 88,
        CompletenessScore: 100,
        FluencyScore: 92,
        PronScore: 89,
        ProsodyScore: 85,
      },
      Words: [
        {
          Duration: 5_000_000,
          Offset: 3_000_000,
          Phonemes: [
            { Duration: 1_200_000, Offset: 3_000_000, Phoneme: "h", PronunciationAssessment: { AccuracyScore: 95 } },
            { Duration: 1_300_000, Offset: 4_200_000, Phoneme: "ə", PronunciationAssessment: { AccuracyScore: 91 } },
            { Duration: 1_200_000, Offset: 5_500_000, Phoneme: "l", PronunciationAssessment: { AccuracyScore: 97 } },
            { Duration: 1_300_000, Offset: 6_700_000, Phoneme: "oʊ", PronunciationAssessment: { AccuracyScore: 93 } },
          ],
          PronunciationAssessment: { AccuracyScore: 94, ErrorType: "None" },
          Syllables: [
            { Duration: 2_500_000, Grapheme: "he", Offset: 3_000_000, PronunciationAssessment: { AccuracyScore: 93 }, Syllable: "hə" },
            { Duration: 2_500_000, Grapheme: "llo", Offset: 5_500_000, PronunciationAssessment: { AccuracyScore: 95 }, Syllable: "loʊ" },
          ],
          Word: "hello",
        },
        {
          Duration: 3_600_000,
          Offset: 8_000_000,
          Phonemes: [
            {
              Duration: 900_000,
              Offset: 8_000_000,
              Phoneme: "w",
              PronunciationAssessment: {
                AccuracyScore: 41,
                // 🔴 THE FIELD THE WHOLE INTEGRATION IS FOR. The learner's /w/ came out closer to a
                // /v/, and that is a sentence a teacher can say. The score alone is not.
                NBestPhonemes: [
                  { Phoneme: "v", Score: 71 },
                  { Phoneme: "w", Score: 41 },
                  { Phoneme: "b", Score: 22 },
                ],
              },
            },
            { Duration: 900_000, Offset: 8_900_000, Phoneme: "ɜr", PronunciationAssessment: { AccuracyScore: 84 } },
            { Duration: 900_000, Offset: 9_800_000, Phoneme: "l", PronunciationAssessment: { AccuracyScore: 90 } },
            { Duration: 900_000, Offset: 10_700_000, Phoneme: "d", PronunciationAssessment: { AccuracyScore: 88 } },
          ],
          PronunciationAssessment: { AccuracyScore: 76, ErrorType: "Mispronunciation" },
          Syllables: [
            { Duration: 3_600_000, Grapheme: "world", Offset: 8_000_000, PronunciationAssessment: { AccuracyScore: 76 }, Syllable: "wɜrld" },
          ],
          Word: "world",
        },
      ],
    },
  ],
  Offset: 3_000_000,
  RecognitionStatus: "Success",
};

/** es-ES, "el perro corre rápido" — the trill missed, and one word skipped entirely. */
export const ES_ES_MIXED: unknown = {
  Duration: 21_000_000,
  DisplayText: "El perro corre rápido.",
  NBest: [
    {
      Confidence: 0.88,
      Display: "El perro corre rápido.",
      Lexical: "el perro corre rápido",
      PronunciationAssessment: {
        AccuracyScore: 71,
        CompletenessScore: 75,
        FluencyScore: 68,
        PronScore: 70,
        ProsodyScore: 64,
      },
      Words: [
        {
          Duration: 1_500_000,
          Offset: 2_000_000,
          Phonemes: [
            { Duration: 700_000, Offset: 2_000_000, Phoneme: "e", PronunciationAssessment: { AccuracyScore: 96 } },
            { Duration: 800_000, Offset: 2_700_000, Phoneme: "l", PronunciationAssessment: { AccuracyScore: 94 } },
          ],
          PronunciationAssessment: { AccuracyScore: 95, ErrorType: "None" },
          Word: "el",
        },
        {
          Duration: 5_000_000,
          Offset: 3_500_000,
          Phonemes: [
            { Duration: 900_000, Offset: 3_500_000, Phoneme: "p", PronunciationAssessment: { AccuracyScore: 92 } },
            { Duration: 900_000, Offset: 4_400_000, Phoneme: "e", PronunciationAssessment: { AccuracyScore: 88 } },
            {
              Duration: 1_400_000,
              Offset: 5_300_000,
              Phoneme: "r",
              PronunciationAssessment: {
                AccuracyScore: 28,
                NBestPhonemes: [
                  { Phoneme: "ɾ", Score: 82 },
                  { Phoneme: "r", Score: 28 },
                ],
              },
            },
            { Duration: 900_000, Offset: 6_700_000, Phoneme: "o", PronunciationAssessment: { AccuracyScore: 90 } },
          ],
          PronunciationAssessment: { AccuracyScore: 58, ErrorType: "Mispronunciation" },
          Syllables: [
            { Duration: 1_800_000, Grapheme: "pe", Offset: 3_500_000, PronunciationAssessment: { AccuracyScore: 90 }, Syllable: "pe" },
            { Duration: 3_200_000, Grapheme: "rro", Offset: 5_300_000, PronunciationAssessment: { AccuracyScore: 34 }, Syllable: "ro" },
          ],
          Word: "perro",
        },
        {
          // Skipped entirely. Azure reports an omission with no accuracy at all — never a zero.
          Duration: 0,
          Offset: 8_500_000,
          PronunciationAssessment: { ErrorType: "Omission" },
          Word: "corre",
        },
        {
          Duration: 6_000_000,
          Offset: 8_500_000,
          Phonemes: [
            { Duration: 1_200_000, Offset: 8_500_000, Phoneme: "r", PronunciationAssessment: { AccuracyScore: 74 } },
            { Duration: 1_200_000, Offset: 9_700_000, Phoneme: "a", PronunciationAssessment: { AccuracyScore: 91 } },
            { Duration: 1_200_000, Offset: 10_900_000, Phoneme: "p", PronunciationAssessment: { AccuracyScore: 89 } },
            { Duration: 1_200_000, Offset: 12_100_000, Phoneme: "i", PronunciationAssessment: { AccuracyScore: 87 } },
            { Duration: 1_200_000, Offset: 13_300_000, Phoneme: "ð", PronunciationAssessment: { AccuracyScore: 80 } },
          ],
          PronunciationAssessment: { AccuracyScore: 84, ErrorType: "None" },
          Word: "rápido",
        },
      ],
    },
  ],
  Offset: 2_000_000,
  RecognitionStatus: "Success",
};

/** ja-JP, 「ありがとうございます」 — long vowel shortened, and a flat delivery. */
export const JA_JP_MIXED: unknown = {
  Duration: 18_000_000,
  DisplayText: "ありがとうございます",
  NBest: [
    {
      Confidence: 0.9,
      Display: "ありがとうございます",
      Lexical: "ありがとうございます",
      PronunciationAssessment: {
        AccuracyScore: 79,
        CompletenessScore: 100,
        FluencyScore: 81,
        PronScore: 77,
        ProsodyScore: 55,
      },
      Words: [
        {
          Duration: 8_000_000,
          Offset: 1_000_000,
          Phonemes: [
            { Duration: 1_100_000, Offset: 1_000_000, Phoneme: "a", PronunciationAssessment: { AccuracyScore: 93 } },
            { Duration: 1_100_000, Offset: 2_100_000, Phoneme: "ɾ", PronunciationAssessment: { AccuracyScore: 88 } },
            { Duration: 1_100_000, Offset: 3_200_000, Phoneme: "i", PronunciationAssessment: { AccuracyScore: 91 } },
            { Duration: 1_100_000, Offset: 4_300_000, Phoneme: "ɡ", PronunciationAssessment: { AccuracyScore: 90 } },
            { Duration: 1_100_000, Offset: 5_400_000, Phoneme: "a", PronunciationAssessment: { AccuracyScore: 92 } },
            {
              Duration: 1_100_000,
              Offset: 6_500_000,
              Phoneme: "toː",
              PronunciationAssessment: {
                // The long vowel produced short. In Japanese that is a different word, which is
                // exactly the kind of error a whole-utterance score buries.
                AccuracyScore: 35,
                NBestPhonemes: [
                  { Phoneme: "to", Score: 79 },
                  { Phoneme: "toː", Score: 35 },
                ],
              },
            },
            { Duration: 1_100_000, Offset: 7_600_000, Phoneme: "ɯ", PronunciationAssessment: { AccuracyScore: 86 } },
          ],
          PronunciationAssessment: { AccuracyScore: 72, ErrorType: "Mispronunciation" },
          // Syllable spans cover their phonemes contiguously, as Azure's do — a fixture with gaps
          // between them would let a "which syllable is this sound in?" lookup pass by accident.
          Syllables: [
            { Duration: 3_300_000, Grapheme: "あり", Offset: 1_000_000, PronunciationAssessment: { AccuracyScore: 91 }, Syllable: "aɾi" },
            { Duration: 3_300_000, Grapheme: "がと", Offset: 4_300_000, PronunciationAssessment: { AccuracyScore: 62 }, Syllable: "ɡato" },
            { Duration: 1_100_000, Grapheme: "う", Offset: 7_600_000, PronunciationAssessment: { AccuracyScore: 86 }, Syllable: "ɯ" },
          ],
          Word: "ありがとう",
        },
        {
          Duration: 8_000_000,
          Offset: 9_500_000,
          PronunciationAssessment: { AccuracyScore: 88, ErrorType: "Monotone" },
          Word: "ございます",
        },
      ],
    },
  ],
  Offset: 1_000_000,
  RecognitionStatus: "Success",
};

/** The learner said something else entirely. */
export const NO_MATCH: unknown = {
  Duration: 4_000_000,
  Offset: 0,
  RecognitionStatus: "NoMatch",
};

/** The microphone was open and nobody spoke. */
export const SILENCE: unknown = {
  Duration: 0,
  Offset: 0,
  RecognitionStatus: "InitialSilenceTimeout",
};

/**
 * A locale that reports word scores and NO phonemes.
 *
 * 🔴 THE CASE THAT MUST NOT CRASH AND MUST NOT PRETEND. Azure's phoneme coverage is a subset of its
 * assessment coverage; a diagnosis for one of these locales can name a word and must not invent a
 * sound.
 */
export const WORDS_ONLY: unknown = {
  DisplayText: "kaks õlut palun",
  Duration: 9_000_000,
  NBest: [
    {
      Confidence: 0.8,
      Display: "kaks õlut palun",
      Lexical: "kaks õlut palun",
      PronunciationAssessment: { AccuracyScore: 66, CompletenessScore: 100, FluencyScore: 70, PronScore: 67 },
      Words: [
        { PronunciationAssessment: { AccuracyScore: 88, ErrorType: "None" }, Word: "kaks" },
        { PronunciationAssessment: { AccuracyScore: 44, ErrorType: "Mispronunciation" }, Word: "õlut" },
        { PronunciationAssessment: { AccuracyScore: 79, ErrorType: "None" }, Word: "palun" },
      ],
    },
  ],
  Offset: 1_000_000,
  RecognitionStatus: "Success",
};

/**
 * The REST short-audio shape: every score FLAT on the NBest candidate and on
 * each word — no `PronunciationAssessment` wrapper anywhere.
 *
 * 🔴 THIS IS WHAT THE DEPLOYED ENDPOINT ACTUALLY RETURNS, and the fixtures
 * above are the SDK's nested shape. speech-live run 3 (2026-08-31) caught the
 * difference in production: a reader that only knew the nested shape parsed
 * every live score to undefined, every ErrorType fell through to "", and a
 * learner who said a different sentence was told "Every word landed." Field
 * names and units follow the short-audio REST docs; the sentence is run 3's.
 */
export const ES_MX_FLAT_REST: unknown = {
  DisplayText: "El perro corre rápido por el parque.",
  Duration: 18_300_000,
  NBest: [
    {
      AccuracyScore: 96,
      CompletenessScore: 100,
      Confidence: 0.95,
      Display: "El perro corre rápido por el parque.",
      FluencyScore: 98,
      ITN: "el perro corre rápido por el parque",
      Lexical: "el perro corre rápido por el parque",
      MaskedITN: "el perro corre rápido por el parque",
      PronScore: 96.8,
      Words: [
        { AccuracyScore: 100, Duration: 2_100_000, ErrorType: "None", Offset: 1_900_000, Word: "El" },
        { AccuracyScore: 88, Duration: 2_700_000, ErrorType: "None", Offset: 4_100_000, Word: "perro" },
        { AccuracyScore: 45, Duration: 2_700_000, ErrorType: "Mispronunciation", Offset: 6_900_000, Word: "corre" },
        { AccuracyScore: 97, Duration: 4_100_000, ErrorType: "None", Offset: 9_700_000, Word: "rápido" },
        { AccuracyScore: 99, Duration: 1_300_000, ErrorType: "None", Offset: 13_900_000, Word: "por" },
        { AccuracyScore: 100, Duration: 900_000, ErrorType: "None", Offset: 15_300_000, Word: "el" },
        { ErrorType: "Omission", Word: "parque" },
      ],
    },
  ],
  Offset: 900_000,
  RecognitionStatus: "Success",
};
