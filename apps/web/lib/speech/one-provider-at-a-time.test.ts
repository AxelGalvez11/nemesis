import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// ── "Only the selected provider is involved", checked on the server side too (§48) ───────────
//
// Owner, 2026-08-22: *"Please trace: when TTS requests are created; whether multiple providers are
// being initialized; whether both providers are called anywhere; whether audio generation blocks the
// text response; whether audio can stream/start earlier rather than waiting for the entire audio
// file; whether there are unnecessary sequential requests or waits."*
//
// `tts-request.test.ts` proves the client sends one request to one provider. These are the two
// findings on the other side of that request — the waits that were real, and the fixes that removed
// them. Both are source assertions, which is the only kind available here: this runner cannot call
// Azure, cannot run a Deno function, and cannot hear audio. What they buy is that a future edit that
// re-introduces either wait fails a test instead of shipping.

const AZURE_ROUTE = readFileSync(new URL("../../app/api/speech/tts/route.ts", import.meta.url), "utf8");
const XAI_FUNCTION = readFileSync(new URL("../../../../supabase/functions/nemesis-speak/index.ts", import.meta.url), "utf8");
const SPEECH_HOOK = readFileSync(new URL("../../components/workspace/learn/use-canvas-speech.ts", import.meta.url), "utf8");
/** The same file with its prose stripped, so an endpoint NAMED in a comment is not read as one CALLED. */
const SPEECH_HOOK_CODE = SPEECH_HOOK.split("\n")
  .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
  .join("\n");

test("🔴🔴 a named Azure voice does not wait for the 700KB catalogue first", () => {
  // FINDING: `/api/speech/tts` fetched Azure's full `/voices/list` before every synthesis. It is
  // cached six hours PER SERVER INSTANCE, which on serverless means every cold instance pays a
  // whole extra round trip in front of the one that makes the sound. The catalogue exists to CHOOSE
  // a voice; a request that already names one has nothing to choose.
  // Calibration: delete the named-voice branch and this reddens.
  const named = AZURE_ROUTE.indexOf("const named = ");
  const catalogue = AZURE_ROUTE.indexOf("await fetchVoiceCatalogue");
  assert.ok(named > 0, "the named-voice fast path is gone");
  assert.ok(named < catalogue, "the catalogue is fetched before the named voice is considered");
  assert.match(AZURE_ROUTE, /AZURE_VOICE_SHAPE\.test\(named\)/, "a client-supplied voice id is trusted unchecked");
});

test("🔴🔴 xAI's audio is piped through rather than buffered twice", () => {
  // FINDING: `nemesis-speak` did `await res.arrayBuffer()`, so it waited for xAI's LAST byte before
  // emitting its FIRST — and the browser then waited for the function's last byte before playing
  // anything. Two full buffers on a response that arrives progressively.
  // Calibration: put `arrayBuffer()` back on the response path and this reddens.
  assert.ok(!/const audio = await res\.arrayBuffer\(\)/.test(XAI_FUNCTION), "the whole file is buffered again");
  assert.match(XAI_FUNCTION, /new ReadableStream<Uint8Array>\(\{/, "the body is not streamed onward");
  // 🔴 AND THE EMPTY-BODY GUARD SURVIVED THE CHANGE. A zero-byte 200 plays as silence, which is
  // indistinguishable from a canvas choosing not to speak — this provider has produced exactly that
  // on the transcription lane before.
  assert.match(XAI_FUNCTION, /reason: "empty-audio"/, "an empty response is no longer named");
  assert.match(XAI_FUNCTION, /if \(!first\) \{/, "nothing checks that any audio arrived at all");
});

test("🔴🔴 the metering still happens BEFORE the provider call, streaming or not", () => {
  // Metering after a successful synthesis is metering nothing: the money is spent the moment xAI
  // answers. Streaming the response must not have quietly moved the charge after it.
  const charge = XAI_FUNCTION.indexOf("await chargeVoiceSeconds");
  const call = XAI_FUNCTION.indexOf('fetch("https://api.x.ai/v1/tts"');
  assert.ok(charge > 0 && call > 0);
  assert.ok(charge < call, "the learner is charged after the money has already been spent");
});

test("🔴🔴 there is exactly ONE fetch on the speech path, and it comes from the plan", () => {
  // The shape that makes two providers impossible: no inline endpoint anywhere, one `fetch`, built
  // from `ttsRequest`. Calibration: add a second fetch to the hook and this reddens.
  const fetches = SPEECH_HOOK.match(/await fetch\(/g) ?? [];
  assert.equal(fetches.length, 1, `the speech hook makes ${fetches.length} requests per utterance`);
  assert.match(SPEECH_HOOK, /const res = await fetch\(plan\.url, plan\.init\)/);
  assert.ok(!/nemesis-speak|api\/speech\/tts/.test(SPEECH_HOOK_CODE), "an endpoint is still hard-coded in the hook");
});

test("🔴🔴 nothing on the client waits for the last byte either", () => {
  // Both routes stream, and until §48 the client threw that away with `await res.blob()` — on BOTH
  // lanes. A stream on the server re-buffered into a file on the client is not a stream.
  // Calibration: put `res.blob()` back on either playback path and this reddens.
  const PLAYER = readFileSync(new URL("../../components/workspace/learn/use-response-audio.ts", import.meta.url), "utf8");
  for (const [lane, source] of [["the narration lane", SPEECH_HOOK_CODE], ["the response player", PLAYER]] as const) {
    assert.ok(!/await res(ponse)?\.blob\(\)/.test(source), `${lane} still buffers the whole file before playing`);
    assert.match(source, /pumpInto\(/, `${lane} does not stream into the element`);
  }
});

test("🔴 neither provider is 'initialised' at all — there is nothing to warm up or keep alive", () => {
  // The owner asked whether multiple providers are being initialised. They are not, and this is why:
  // both lanes are a single stateless HTTPS request built per utterance. There is no SDK, no client
  // object, no connection pool and no module-level handle on either side, so selecting one provider
  // cannot leave the other holding anything.
  const CLIENT = readFileSync(new URL("../learn/tts-request.ts", import.meta.url), "utf8");
  assert.ok(!/new [A-Z]\w*Client|createClient|\.connect\(/.test(CLIENT), "a provider client is being constructed");
  assert.ok(!/^(let|const) \w+ = new /m.test(CLIENT), "provider state is being held at module scope");
});
