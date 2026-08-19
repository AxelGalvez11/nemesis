// Parsing Azure's catalogue, and surviving the day it grows a field.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `a malformed entry is skipped and counted`. Azure adds
// fields to this payload without notice — `RolePlayList` and `SecondaryLocaleList` both arrived
// after launch — and a parser that threw would take the language lane down on a vendor's release
// schedule. One that skipped SILENTLY would hide the day the shape changed, which is worse: the
// catalogue would quietly shrink and every affected locale would start reporting "unsupported".

import assert from "node:assert/strict";
import test from "node:test";

import { AZURE_VOICE_LIST } from "../__fixtures__/azure-voices";
import {
  CATALOGUE_TTL_MS,
  fetchVoiceCatalogue,
  forgetVoiceCatalogue,
  httpRefusal,
  normaliseVoiceList,
} from "./voice-catalog";

const AZURE_ENV = { AZURE_SPEECH_KEY: "test-key", AZURE_SPEECH_REGION: "eastus" };

test("🔴 a malformed entry is skipped and counted, never fatal and never silent", () => {
  const catalogue = normaliseVoiceList(AZURE_VOICE_LIST, "2026-08-19T00:00:00.000Z");
  assert.equal(catalogue.skipped, 1, "the entry with no ShortName was parsed or the count was lost");
  assert.equal(catalogue.voices.length, AZURE_VOICE_LIST.length - 1);
});

test("fields Nemesis does not read do not break the ones it does", () => {
  const catalogue = normaliseVoiceList(AZURE_VOICE_LIST, "2026-08-19T00:00:00.000Z");
  const dalia = catalogue.voices.find((voice) => voice.shortName === "es-MX-DaliaNeural");
  assert.equal(dalia?.locale, "es-MX");
  assert.equal(dalia?.gender, "female");
  assert.deepEqual(dalia?.roles, ["Girl", "YoungAdultFemale"]);
  assert.deepEqual(dalia?.styles, ["cheerful", "sad", "whispering"]);
  assert.equal(dalia?.sampleRateHz, 24000, "the sample rate arrives as a STRING and must still parse");
  assert.equal(dalia?.wordsPerMinute, 162);
});

test("the local name is kept in its own script, because that is what a learner should see", () => {
  const catalogue = normaliseVoiceList(AZURE_VOICE_LIST, "2026-08-19T00:00:00.000Z");
  assert.equal(catalogue.voices.find((voice) => voice.shortName === "ja-JP-NanamiNeural")?.localName, "七海");
});

test("🔴 voice type is matched by substring, so the next tier name does not read as retired", () => {
  // `Neural`, `NeuralHD` and the multilingual variants all contain "neural"; `Standard` does not.
  const catalogue = normaliseVoiceList(
    [
      { Locale: "en-US", ShortName: "a", VoiceType: "NeuralHD" },
      { Locale: "en-US", ShortName: "b", VoiceType: "Standard" },
    ],
    "2026-08-19T00:00:00.000Z",
  );
  assert.equal(catalogue.voices[0].neural, true);
  assert.equal(catalogue.voices[1].neural, false);
});

test("an unrecognised gender is neutral rather than guessed into one of two", () => {
  const catalogue = normaliseVoiceList([{ Gender: "Neutral", Locale: "en-US", ShortName: "x", VoiceType: "Neural" }], "t");
  assert.equal(catalogue.voices[0].gender, "neutral");
});

test("a payload that is not a list is an empty catalogue, not a crash", () => {
  assert.deepEqual(normaliseVoiceList({ error: "nope" }, "t").voices, []);
  assert.deepEqual(normaliseVoiceList(null, "t").voices, []);
});

// ───────────────────────────────────────────────────────────────── the fetch around it

test("the catalogue is fetched once and reused inside its window", async () => {
  forgetVoiceCatalogue();
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    return new Response(JSON.stringify(AZURE_VOICE_LIST), { status: 200 });
  }) as unknown as typeof fetch;

  let clock = 1_000_000;
  const deps = { env: AZURE_ENV, fetch: fetcher, now: () => clock };
  assert.equal((await fetchVoiceCatalogue(deps)).ok, true);
  assert.equal((await fetchVoiceCatalogue(deps)).ok, true);
  assert.equal(calls, 1, "the catalogue was refetched inside its cache window");

  // 🔴 A ROUND TRIP TO AZURE IN FRONT OF THE ROUND TRIP THAT MAKES THE AUDIO IS THE LATENCY THIS
  // CACHE EXISTS TO REMOVE, and a cache that never expired would pin a stale catalogue forever.
  clock += CATALOGUE_TTL_MS + 1;
  assert.equal((await fetchVoiceCatalogue(deps)).ok, true);
  assert.equal(calls, 2);
  forgetVoiceCatalogue();
});

test("🔴 a missing credential is a named refusal, never an empty catalogue", () => {
  forgetVoiceCatalogue();
  return fetchVoiceCatalogue({ env: {}, fetch: (() => {
    throw new Error("the network was reached without a key");
  }) as unknown as typeof fetch }).then((result) => {
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "azure-key-missing");
  });
});

test("each HTTP status becomes a different thing to say", async () => {
  // 429 is its own reason because the free tier hits it on ordinary drilling: "slow down" and "your
  // key is wrong" call for completely different words on screen.
  assert.equal(httpRefusal(401), "azure-unauthorised");
  assert.equal(httpRefusal(403), "azure-unauthorised");
  assert.equal(httpRefusal(429), "azure-rate-limited");
  assert.equal(httpRefusal(500), "azure-error");

  forgetVoiceCatalogue();
  const result = await fetchVoiceCatalogue({
    env: AZURE_ENV,
    fetch: (async () => new Response("", { status: 429 })) as unknown as typeof fetch,
  });
  assert.equal(result.ok === false && result.reason, "azure-rate-limited");
  forgetVoiceCatalogue();
});

test("a 200 with no usable voices is a failure, not a small catalogue", async () => {
  forgetVoiceCatalogue();
  const result = await fetchVoiceCatalogue({
    env: AZURE_ENV,
    fetch: (async () => new Response("[]", { status: 200 })) as unknown as typeof fetch,
  });
  assert.equal(result.ok === false && result.reason, "catalogue-empty");
  forgetVoiceCatalogue();
});

test("an unreachable provider is named as unreachable", async () => {
  forgetVoiceCatalogue();
  const result = await fetchVoiceCatalogue({
    env: AZURE_ENV,
    fetch: (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch,
  });
  assert.equal(result.ok === false && result.reason, "azure-unreachable");
  forgetVoiceCatalogue();
});
