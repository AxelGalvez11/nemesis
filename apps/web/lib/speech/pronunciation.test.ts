// The seam, and the guards that stand between a recording and a paid API.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `unusable audio never reaches the provider`. A learner who
// presses record and releases immediately sends a few hundred bytes of container header and no
// speech. Azure answers `NoMatch` — correct, and it costs a round trip, a quota slot on a free tier
// that allows twenty a minute, and two seconds of the learner's attention to discover something the
// byte count already said.

import assert from "node:assert/strict";
import test from "node:test";

import { EN_US_GOOD } from "./__fixtures__/azure-assessments";
import { assessPronunciation } from "./pronunciation";

const AZURE_ENV = { AZURE_SPEECH_KEY: "test-key", AZURE_SPEECH_REGION: "eastus" };
const AUDIO = new ArrayBuffer(9_000);
const never = (() => {
  throw new Error("the provider was called");
}) as unknown as typeof fetch;

test("🔴 unusable audio never reaches the provider", async () => {
  const tooSmall = await assessPronunciation(
    { env: AZURE_ENV, fetch: never },
    { audio: new ArrayBuffer(200), contentType: "audio/webm", locale: "en-US", referenceText: "hello" },
  );
  assert.equal(tooSmall.ok === false && tooSmall.reason, "audio-unusable");

  // Safari's MediaRecorder output. Refused by name so the failure is diagnosable rather than a 400.
  const wrongFormat = await assessPronunciation(
    { env: AZURE_ENV, fetch: never },
    { audio: AUDIO, contentType: "audio/mp4", locale: "en-US", referenceText: "hello" },
  );
  assert.equal(wrongFormat.ok === false && wrongFormat.reason, "audio-unusable");
  assert.match(wrongFormat.ok === false ? wrongFormat.detail : "", /audio\/mp4/);
});

test("🔴 assessment is always against a target, and there is no default", async () => {
  const result = await assessPronunciation(
    { env: AZURE_ENV, fetch: never },
    { audio: AUDIO, contentType: "audio/webm", locale: "en-US", referenceText: "   " },
  );
  assert.equal(result.ok === false && result.reason, "no-target");
});

test("the locale and the detailed format both reach the request", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fetcher = (async (url: string, init: RequestInit) => {
    seen = { init, url };
    return new Response(JSON.stringify(EN_US_GOOD), { status: 200 });
  }) as unknown as typeof fetch;

  const result = await assessPronunciation(
    { env: AZURE_ENV, fetch: fetcher },
    { audio: AUDIO, contentType: "audio/webm;codecs=opus", locale: "ja-JP", referenceText: "hello world" },
  );
  assert.equal(result.ok, true);
  const url = new URL(seen!.url);
  assert.equal(url.searchParams.get("language"), "ja-JP");
  // `detailed` is what carries NBest, and NBest carries every assessment number.
  assert.equal(url.searchParams.get("format"), "detailed");
  const headers = seen!.init.headers as Record<string, string>;
  assert.ok(headers["Pronunciation-Assessment"], "the assessment config never reached Azure");
  assert.ok(!seen!.url.includes("test-key"), "the key travelled in the URL");
});

test("🔴 a 400 naming the language is unsupported-locale, not a generic error", async () => {
  // Telling a learner studying Welsh that "something went wrong" sends them to retry an attempt that
  // will never work.
  const result = await assessPronunciation(
    {
      env: AZURE_ENV,
      fetch: (async () =>
        new Response('{"error":"Unsupported language cy-GB for pronunciation assessment"}', { status: 400 })) as unknown as typeof fetch,
    },
    { audio: AUDIO, contentType: "audio/webm", locale: "cy-GB", referenceText: "bore da" },
  );
  assert.equal(result.ok === false && result.reason, "locale-unsupported");
});

test("throttling, a bad key and an outage are three different reasons", async () => {
  const statuses: [number, string][] = [
    [429, "provider-rate-limited"],
    [401, "provider-unauthorised"],
    [500, "provider-error"],
  ];
  for (const [status, expected] of statuses) {
    const result = await assessPronunciation(
      { env: AZURE_ENV, fetch: (async () => new Response("", { status })) as unknown as typeof fetch },
      { audio: AUDIO, contentType: "audio/webm", locale: "en-US", referenceText: "hello" },
    );
    assert.equal(result.ok === false && result.reason, expected, `${status} mapped wrongly`);
  }
});

test("an unreachable provider is named rather than reported as a learner failure", async () => {
  const result = await assessPronunciation(
    {
      env: AZURE_ENV,
      fetch: (async () => {
        throw new Error("ECONNRESET");
      }) as unknown as typeof fetch,
    },
    { audio: AUDIO, contentType: "audio/webm", locale: "en-US", referenceText: "hello" },
  );
  assert.equal(result.ok === false && result.reason, "provider-unreachable");
});

test("latency is measured on the round trip, not guessed", async () => {
  let clock = 0;
  const result = await assessPronunciation(
    {
      env: AZURE_ENV,
      fetch: (async () => {
        clock += 430;
        return new Response(JSON.stringify(EN_US_GOOD), { status: 200 });
      }) as unknown as typeof fetch,
      now: () => clock,
    },
    { audio: AUDIO, contentType: "audio/webm", locale: "en-US", referenceText: "hello world" },
  );
  assert.equal(result.ok && result.evidence.latencyMs, 430);
});
