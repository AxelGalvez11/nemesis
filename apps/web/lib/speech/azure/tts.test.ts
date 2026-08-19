// The SSML Azure is sent.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `the text is escaped`. SSML is XML, the text comes from a
// model, and an unescaped `&` does not produce a wrong voice — it produces a 400 and silence in a
// lesson. An unescaped `<` is worse: it lets a model emit its own prosody tags into a document
// Nemesis sends to a paid API under its own credential.

import assert from "node:assert/strict";
import test from "node:test";

import { AZURE_MAX_CHARS, buildSsml, escapeSsml, synthesise } from "./tts";

const AZURE_ENV = { AZURE_SPEECH_KEY: "test-key", AZURE_SPEECH_REGION: "eastus" };

test("🔴 text is escaped, so a model cannot write markup into the request", () => {
  assert.equal(escapeSsml("Tom & Jerry"), "Tom &amp; Jerry");
  const ssml = buildSsml({
    locale: "en-US",
    text: '</voice><voice name="other">hijacked</voice><voice name="x">',
    voice: "en-US-JennyNeural",
  });
  assert.equal(ssml.match(/<voice /g)?.length, 1, "a second voice element reached the document");
  assert.ok(ssml.includes("&lt;/voice&gt;"));
});

test("the rate is a percentage delta, and 1 emits no prosody element at all", () => {
  // Azure takes "+0%" happily, but an element that says nothing is an element that can be wrong.
  assert.ok(!buildSsml({ locale: "es-MX", text: "hola", voice: "es-MX-DaliaNeural" }).includes("<prosody"));
  assert.ok(buildSsml({ locale: "es-MX", rate: 0.95, text: "hola", voice: "es-MX-DaliaNeural" }).includes('rate="-5%"'));
  assert.ok(buildSsml({ locale: "es-MX", rate: 1.1, text: "hola", voice: "es-MX-DaliaNeural" }).includes('rate="+10%"'));
});

test("a style is only emitted when one was asked for", () => {
  const plain = buildSsml({ locale: "ja-JP", text: "こんにちは", voice: "ja-JP-NanamiNeural" });
  assert.ok(!plain.includes("mstts:express-as"));
  const styled = buildSsml({ locale: "ja-JP", style: "cheerful", text: "こんにちは", voice: "ja-JP-NanamiNeural" });
  assert.ok(styled.includes('<mstts:express-as style="cheerful">'));
});

test("non-Latin text survives the document intact", () => {
  const ssml = buildSsml({ locale: "ja-JP", text: "ありがとうございます", voice: "ja-JP-NanamiNeural" });
  assert.ok(ssml.includes("ありがとうございます"));
  assert.ok(ssml.includes('xml:lang="ja-JP"'));
});

test("🔴 an empty or oversized request never reaches the provider", () => {
  const never = (() => {
    throw new Error("the provider was called");
  }) as unknown as typeof fetch;
  return Promise.all([
    synthesise({ env: AZURE_ENV, fetch: never }, { locale: "en-US", text: "   ", voice: "v" }),
    synthesise({ env: AZURE_ENV, fetch: never }, { locale: "en-US", text: "x".repeat(AZURE_MAX_CHARS + 1), voice: "v" }),
  ]).then(([empty, long]) => {
    assert.equal(empty.ok === false && empty.reason, "empty-text");
    assert.equal(long.ok === false && long.reason, "too-long-to-speak");
  });
});

test("a missing credential refuses without a network call", async () => {
  const result = await synthesise(
    { env: {}, fetch: (() => {
      throw new Error("the network was reached without a key");
    }) as unknown as typeof fetch },
    { locale: "en-US", text: "hello", voice: "en-US-JennyNeural" },
  );
  assert.equal(result.ok === false && result.reason, "azure-key-missing");
});

test("🔴 the key travels in a header and never in the URL", async () => {
  // A key in a query string lands in every access log between here and Redmond.
  let seen: { url: string; init: RequestInit } | null = null;
  const fetcher = (async (url: string, init: RequestInit) => {
    seen = { init, url };
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as unknown as typeof fetch;
  await synthesise({ env: AZURE_ENV, fetch: fetcher }, { collect: true, locale: "en-US", text: "hi", voice: "v" });
  assert.ok(seen);
  assert.ok(!seen!.url.includes("test-key"));
  assert.equal((seen!.init.headers as Record<string, string>)["Ocp-Apim-Subscription-Key"], "test-key");
  assert.match((seen!.init.headers as Record<string, string>)["X-Microsoft-OutputFormat"], /mp3/);
});

test("a zero-byte 200 is a failure, because it plays as silence", async () => {
  const result = await synthesise(
    { env: AZURE_ENV, fetch: (async () => new Response(new Uint8Array([]), { status: 200 })) as unknown as typeof fetch },
    { collect: true, locale: "en-US", text: "hi", voice: "v" },
  );
  assert.equal(result.ok === false && result.reason, "empty-audio");
});

test("latency is measured on every outcome, including the failures", async () => {
  let clock = 0;
  const deps = {
    env: AZURE_ENV,
    fetch: (async () => {
      clock += 250;
      return new Response("nope", { status: 500 });
    }) as unknown as typeof fetch,
    now: () => clock,
  };
  const result = await synthesise(deps, { locale: "en-US", text: "hi", voice: "v" });
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.latencyMs, 250);
});

test("the body is handed back unread so a route can stream it", async () => {
  const result = await synthesise(
    { env: AZURE_ENV, fetch: (async () => new Response(new Uint8Array([9, 9]), { status: 200 })) as unknown as typeof fetch },
    { locale: "en-US", text: "hi", voice: "en-US-JennyNeural" },
  );
  assert.ok(result.ok);
  assert.ok(result.ok && result.audio instanceof ReadableStream, "the audio was buffered instead of streamed");
});
