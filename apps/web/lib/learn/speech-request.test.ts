// Which synthesiser actually receives the utterance.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is `an Azure-routed utterance is sent to Azure`. Everything
// else is coverage. That one guards the gap the owner heard: the router had been naming Azure for
// the language lane since §47, and every utterance went to xAI anyway, because nothing on the I/O
// path read the decision. A router nothing reads sounds exactly like no router at all.

import assert from "node:assert/strict";
import test from "node:test";

import { AZURE_TTS_PATH, planSpeech, withoutAzure } from "./speech-request";

const SENTENCE = "¿Dónde está la biblioteca?";

// ───────────────────────────────────────────────────────── the gap this closes

test("🔴 an Azure-routed utterance with a named locale is sent to Azure", () => {
  const plan = planSpeech({ locale: "es-MX", provider: "azure", speed: 1, text: SENTENCE });
  assert.equal(plan.endpoint, "azure");
  assert.equal(plan.endpoint === "azure" && plan.body.locale, "es-MX");
  assert.equal(plan.endpoint === "azure" && plan.body.text, SENTENCE);
});

test("the route's own name for pace is `rate`, so the body it receives is the body it documents", () => {
  const plan = planSpeech({ locale: "ja-JP", provider: "azure", speed: 1, text: "図書館はどこですか" });
  assert.equal(plan.endpoint === "azure" && plan.body.rate, 1);
  assert.equal(plan.endpoint === "azure" && "speed" in plan.body, false);
});

test("the endpoint is the live one, not a path invented here", () => {
  assert.equal(AZURE_TTS_PATH, "/api/speech/tts");
});

// ───────────────────────────────────────────────────────── Azure is never asked for a 400

test("🔴 no locale means no Azure, because the route refuses without one", () => {
  assert.equal(planSpeech({ provider: "azure", text: SENTENCE }).endpoint, "xai");
});

test("`auto` is not a locale for this lane — it is the provider guessing, which is the whole refusal", () => {
  assert.equal(planSpeech({ locale: "auto", provider: "azure", text: SENTENCE }).endpoint, "xai");
});

test("a display name where a tag belongs does not reach the catalogue", () => {
  assert.equal(planSpeech({ locale: "Mexican Spanish", provider: "azure", text: SENTENCE }).endpoint, "xai");
});

// ───────────────────────────────────────────────────────── the canvas lane is untouched

test("🔴 no provider is the Canvas lane, and its request is what it always was", () => {
  const plan = planSpeech({ text: "Which structure filters the blood first?" });
  assert.equal(plan.endpoint, "xai");
  assert.deepEqual(plan.body, { text: "Which structure filters the blood first?" });
});

test("every field is still omitted when unset, so an old canvas sends an unchanged body", () => {
  const plan = planSpeech({ locale: "auto", text: "Say this" });
  assert.deepEqual(plan.body, { text: "Say this" });
});

test("a chosen speaker and pace still ride along to xAI", () => {
  const plan = planSpeech({ locale: "en-GB", speed: 0.95, text: "Say this", voiceId: "ember" });
  assert.deepEqual(plan.body, { locale: "en-GB", speed: 0.95, text: "Say this", voice: "ember" });
});

test("an explicitly xAI-routed utterance stays on xAI even with a named locale", () => {
  assert.equal(planSpeech({ locale: "es-MX", provider: "xai", text: SENTENCE }).endpoint, "xai");
});

// ───────────────────────────────────────────────────────── worse audio, still a lesson

test("🔴 the fall back from Azure keeps the locale, so Spanish degrades to Spanish and not to English", () => {
  const plan = withoutAzure({ locale: "es-MX", provider: "azure", speed: 1, text: SENTENCE });
  assert.equal(plan.endpoint, "xai");
  assert.equal(plan.endpoint === "xai" && plan.body.locale, "es-MX");
  assert.equal(plan.endpoint === "xai" && plan.body.speed, 1);
});

test("the speaker survives the fall too", () => {
  const plan = withoutAzure({ locale: "es-MX", provider: "azure", text: SENTENCE, voiceId: "ember" });
  assert.equal(plan.endpoint === "xai" && plan.body.voice, "ember");
});
