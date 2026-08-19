// Does any of this work against the real Azure? Run it and find out.
//
// 🔴 THE SUITE CANNOT ANSWER THIS AND NEVER WILL. Every test in `lib/speech` runs against fixtures,
// which proves the transform is right about the shape Azure returned on the day the fixture was
// written. It proves nothing about whether the credential works, whether the region is right,
// whether the endpoints have moved, or whether an es-MX voice still exists. Only a real request
// does, and any claim otherwise is unearned.
//
// 🔴 THE TWO HALVES ARE CHECKED AGAINST EACH OTHER, WHICH IS THE POINT OF DOING IT LIVE. Check 4
// synthesises a sentence with Azure and then asks Azure to score that audio against the same
// sentence. A native-quality reading must come back near the top of the scale. If the SSML is wrong,
// the format is wrong, the header is wrong, or the normalisation is wrong, that number collapses —
// and no fixture-driven test can produce it.
//
//   AZURE_SPEECH_KEY=... AZURE_SPEECH_REGION=eastus npx tsx scripts/azure-speech-acceptance.mts
//
// With no credential it reports every check as SKIP and exits 0: this runs in environments that have
// no Azure key on purpose, and a red build there would teach people to ignore it.

import { azureSpeechConfig } from "../lib/speech/azure/config";
import { assessWithAzure } from "../lib/speech/azure/pronunciation";
import { AZURE_PCM_FORMAT, synthesise } from "../lib/speech/azure/tts";
import { fetchVoiceCatalogue } from "../lib/speech/azure/voice-catalog";
import { diagnose } from "../lib/speech/pronunciation-diagnosis";
import { selectVoice, supportedLocales } from "../lib/speech/voice-selection";

let passed = 0;
let failed = 0;
let skipped = 0;

function check(id: string, ok: boolean, detail: string): void {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}`);
  console.log(`      ${detail}`);
}

function skip(id: string, why: string): void {
  skipped += 1;
  console.log(`SKIP  ${id}`);
  console.log(`      ${why}`);
}

/**
 * The three languages the tests cover, for the same reason they cover them: English is what
 * everything is accidentally built around, Spanish is where the region distinction bites, and
 * Japanese is non-Romance with a different script and a different syllable structure.
 */
const LANGUAGES = [
  { locale: "en-US", text: "The quick brown fox jumps over the lazy dog." },
  { locale: "es-MX", text: "El perro corre rápido por el parque." },
  { locale: "ja-JP", text: "今日はいい天気ですね。" },
];

const configured = azureSpeechConfig();
if (!configured.ok) {
  console.log(`Azure is not configured here (${configured.reason}): ${configured.detail}\n`);
  for (const id of ["1. catalogue", "2. voice per language", "3. synthesis", "4. round trip", "5. refusals"]) {
    skip(id, "no AZURE_SPEECH_KEY / AZURE_SPEECH_REGION in this environment");
  }
  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped (no credential)`);
  process.exit(0);
}

const catalogue = await fetchVoiceCatalogue({ fetch });
if (!catalogue.ok) {
  check("1. catalogue", false, `${catalogue.reason}: ${catalogue.detail}`);
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(1);
}

const locales = supportedLocales(catalogue.catalogue.voices);
check(
  "1. the catalogue is fetched live, and it is a catalogue rather than a shortlist",
  catalogue.catalogue.voices.length > 100 && locales.length > 50,
  `${catalogue.catalogue.voices.length} voices across ${locales.length} locales in ${catalogue.latencyMs}ms` +
    (catalogue.catalogue.skipped > 0 ? ` — ${catalogue.catalogue.skipped} entries UNPARSEABLE, the payload has moved` : ""),
);

for (const language of LANGUAGES) {
  const chosen = selectVoice(catalogue.catalogue.voices, { locale: language.locale });
  check(
    `2. ${language.locale} maps to a named voice`,
    chosen.ok,
    chosen.ok
      ? `${chosen.choice.voice.shortName} (${chosen.choice.voice.localName}, ${chosen.choice.voice.gender}) — ${chosen.choice.match}`
      : `${chosen.reason}: ${chosen.detail}`,
  );
  if (!chosen.ok) continue;

  const spoken = await synthesise({ fetch }, { collect: true, locale: language.locale, text: language.text, voice: chosen.choice.voice.shortName });
  const bytes = spoken.ok ? new Uint8Array(spoken.bytes!) : new Uint8Array();
  check(
    `3. ${language.locale} synthesises real MP3 audio`,
    // 0xFF 0xFB / 0xFF 0xF3 is an MPEG frame header; "ID3" is a tag. Anything else is not audio.
    spoken.ok && bytes.length > 2_000 && (bytes[0] === 0xff || String.fromCharCode(...bytes.slice(0, 3)) === "ID3"),
    spoken.ok
      ? `${bytes.length} bytes in ${spoken.latencyMs}ms for ${spoken.characters} characters`
      : `${spoken.reason}: ${spoken.detail}`,
  );
}

// ─────────────────────────────────────────────────────────── the round trip
const roundTrip = LANGUAGES[1];
const voice = selectVoice(catalogue.catalogue.voices, { locale: roundTrip.locale });
if (!voice.ok) {
  check("4. round trip", false, `no voice for ${roundTrip.locale}`);
} else {
  const wav = await synthesise(
    { fetch },
    { collect: true, locale: roundTrip.locale, outputFormat: AZURE_PCM_FORMAT, text: roundTrip.text, voice: voice.choice.voice.shortName },
  );
  if (!wav.ok) {
    check("4. round trip", false, `synthesis failed: ${wav.reason}`);
  } else {
    const assessed = await assessWithAzure(
      { fetch },
      { audio: wav.bytes!, contentType: "audio/wav", locale: roundTrip.locale, referenceText: roundTrip.text },
    );
    if (!assessed.ok) {
      check("4. round trip", false, `assessment failed: ${assessed.reason} — ${assessed.detail}`);
    } else {
      const result = diagnose(assessed.evidence);
      const score = assessed.evidence.overall?.overall ?? 0;
      check(
        "4. Azure scores its own native voice near the top, so the whole chain is sound",
        score > 0.8 && (assessed.evidence.words?.length ?? 0) > 0,
        `pron ${score.toFixed(2)}, accuracy ${assessed.evidence.overall?.accuracy?.toFixed(2)}, ` +
          `${assessed.evidence.words?.length} words, ${assessed.evidence.words?.filter((word) => word.phonemes).length} with phonemes, ` +
          `verdict "${result.verdict}" in ${assessed.evidence.latencyMs}ms`,
      );
      check(
        "4b. phoneme-level detail actually arrives for this locale",
        (assessed.evidence.words ?? []).some((word) => (word.phonemes?.length ?? 0) > 0),
        (assessed.evidence.words ?? [])
          .slice(0, 2)
          .map((word) => `${word.word}: ${word.phonemes?.map((phoneme) => phoneme.phoneme).join(" ") ?? "no phonemes"}`)
          .join(" | "),
      );
    }
  }
}

// ─────────────────────────────────────────────────────────── the refusals, live
const unusable = await assessWithAzure(
  { fetch },
  { audio: new ArrayBuffer(120), contentType: "audio/wav", locale: "en-US", referenceText: "hello" },
);
check(
  "5. unusable audio is refused locally, without spending a request",
  !unusable.ok && unusable.reason === "audio-unusable",
  unusable.ok ? "a 120-byte recording was sent to the provider" : `${unusable.reason}: ${unusable.detail}`,
);

const nonsenseLocale = selectVoice(catalogue.catalogue.voices, { locale: "zz-ZZ" });
check(
  "5b. a language Azure does not speak is named rather than substituted",
  !nonsenseLocale.ok && nonsenseLocale.reason === "locale-unsupported",
  nonsenseLocale.ok ? `it chose ${nonsenseLocale.choice.voice.shortName}` : nonsenseLocale.detail,
);

console.log(`\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""} (live Azure, region ${configured.config.region})`);
process.exit(failed > 0 ? 1 : 0);
