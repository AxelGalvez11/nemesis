import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

import { SPEECH_CHARS_PER_MINUTE } from "@/lib/workload-cost";
import {
  ATTEMPT_BYTES_PER_SECOND,
  VOICE_CHARS_PER_SECOND,
  secondsForAttemptBytes,
  secondsForCharacters,
} from "./meter";

// 🔴🔴🔴 THE LANGUAGE LANE HAD NO METER, AND THIS FILE IS WHY IT CANNOT LOSE ONE AGAIN.
//
// Audited 2026-08-31 while pricing the $19.99 plan: `/api/speech/tts` and `/api/speech/pronunciation`
// both reached Azure with the server's key and counted nothing. The only gate was "signed in",
// which a free account satisfies. At Azure's published rates that is about $51 a day per account,
// unbounded. The owner's instruction was *"proxy the audio and count it exactly"* — the proxy was
// already there, the counting was not.

const read = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
const TTS = read("../../app/api/speech/tts/route.ts");
const SCORE = read("../../app/api/speech/pronunciation/route.ts");

test("🔴🔴🔴 both Azure routes charge the meter, and do it BEFORE the provider is called", () => {
  // A charge after the call can only report an overrun that has already been paid for.
  for (const [name, source, unit] of [["tts", TTS, "secondsForCharacters"], ["pronunciation", SCORE, "secondsForAttemptBytes"]] as const) {
    assert.match(source, /chargeVoice\(user\.id,/, `${name} does not charge the voice allowance`);
    assert.match(source, new RegExp(`chargeVoice\\(user\\.id, ${unit}\\(`), `${name} charges in the wrong unit`);
    assert.match(source, /if \(!charged\.allowed\)/, `${name} charges but ignores a refusal`);
    const chargeAt = source.indexOf("chargeVoice(user.id");
    const providerAt = Math.min(
      ...[source.indexOf("synthesise("), source.indexOf("assessPronunciation(")].filter((i) => i > 0),
    );
    assert.ok(chargeAt > 0 && chargeAt < providerAt, `${name} calls Azure before it charges`);
  }
});

test("🔴🔴 the refusal is a 429, not a silent success", () => {
  for (const [name, source] of [["tts", TTS], ["pronunciation", SCORE]] as const) {
    assert.match(source, /return json\(quotaResponse\(charged\.reason\), 429\)/, `${name} does not refuse when out of allowance`);
  }
});

test("🔴🔴🔴 the token bypass is gone, and must not come back", () => {
  // It minted a ten-minute Azure token to any signed-in browser and counted nothing. Nothing in the
  // product ever used it — the audio has always been proxied — so it was pure exposure. A route
  // that hands out provider credentials cannot be metered by definition: whatever it issues is
  // spent somewhere this server never sees.
  assert.ok(
    !existsSync(new URL("../../app/api/speech/token/route.ts", import.meta.url)),
    "the Azure token endpoint is back; a credential handed to a browser cannot be counted",
  );
});

test("🔴 the three copies of the speaking rate agree", () => {
  // The rate lives in three deployment units that cannot import each other: this file, the cost
  // model, and `nemesis-speak`. Copies are tolerable; disagreement is not, because it would mean a
  // learner is charged one number and billed by another.
  assert.equal(VOICE_CHARS_PER_SECOND, SPEECH_CHARS_PER_MINUTE / 60, "the web meter and the cost model disagree");
  const speak = readFileSync(new URL("../../../../supabase/functions/nemesis-speak/index.ts", import.meta.url), "utf8");
  assert.match(speak, new RegExp(`CHARS_PER_SECOND = ${SPEECH_CHARS_PER_MINUTE} / 60`), "nemesis-speak's rate drifted from the model's");
});

test("🔴 a charge is never zero, and always rounds up", () => {
  // A request that reaches a paid provider is never free. Rounding down would make the meter
  // skippable by sending one word at a time.
  assert.equal(secondsForCharacters(0), 1);
  assert.equal(secondsForCharacters(1), 1);
  assert.equal(secondsForCharacters(850), 60, "a minute of speech should cost a minute");
  assert.equal(secondsForCharacters(851), 61, "a part second is charged as a second");
  assert.equal(secondsForAttemptBytes(0), 1);
  assert.equal(secondsForAttemptBytes(ATTEMPT_BYTES_PER_SECOND * 5), 5, "a five second clip should cost five");
  assert.equal(secondsForAttemptBytes(ATTEMPT_BYTES_PER_SECOND * 5 + 1), 6);
});

test("🔴 the attempt rate is the one the route sizes its own ceiling from", () => {
  // Charging on a different rate than the size check uses would let a file that passes the check
  // exceed the charge it was admitted under.
  assert.match(SCORE, /MAX_AUDIO_BYTES = \(MAX_ATTEMPT_SECONDS \* 64_000\) \/ 8/, "the route's size ceiling moved");
  assert.equal(ATTEMPT_BYTES_PER_SECOND, 64_000 / 8);
});
