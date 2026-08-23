import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ttsRequest } from "./tts-request";

// ── One utterance, one provider ──────────────────────────────────────────────────────────────
//
// Owner, 2026-08-22: *"I want to make sure we are not generating, initializing, fetching, or waiting
// on both Azure and xAI unnecessarily. If the user has selected an xAI voice, only the xAI path
// should be involved in generating that response's speech."*
//
// This is the file that makes that checkable rather than believable. Every test below asserts the
// NEGATIVE as well as the positive: it is not enough that an xAI request goes to xAI, nothing about
// it may name Azure at all.

const BASE = {
  supabaseAnonKey: "anon-key",
  supabaseUrl: "https://project.supabase.co",
  text: "Kirchhoff's current law.",
  token: "jwt",
} as const;

function bodyOf(init: RequestInit): Record<string, unknown> {
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

test("🔴🔴 an xAI voice reaches xAI and mentions Azure nowhere", () => {
  const plan = ttsRequest({ ...BASE, provider: "xai", voiceId: "ara" });
  assert.equal(plan.provider, "xai");
  assert.equal(plan.url, "https://project.supabase.co/functions/v1/nemesis-speak");
  assert.equal(bodyOf(plan.init).voice, "ara");
  // Calibration: point the xai branch at /api/speech/tts and this reddens.
  const wire = `${plan.url} ${String(plan.init.body)} ${JSON.stringify(plan.init.headers)}`;
  assert.ok(!/azure/i.test(wire), `an xAI request names Azure: ${wire}`);
  assert.ok(!wire.includes("/api/speech/tts"), "an xAI request reaches Azure's route");
});

test("🔴🔴 an Azure voice reaches Azure and mentions xAI nowhere", () => {
  const plan = ttsRequest({ ...BASE, locale: "en-US", provider: "azure", voiceId: "en-US-AvaMultilingualNeural" });
  assert.equal(plan.provider, "azure");
  assert.equal(plan.url, "/api/speech/tts");
  assert.equal(bodyOf(plan.init).voice, "en-US-AvaMultilingualNeural");
  assert.equal(bodyOf(plan.init).locale, "en-US");
  const wire = `${plan.url} ${String(plan.init.body)} ${JSON.stringify(plan.init.headers)}`;
  assert.ok(!/xai|nemesis-speak|x\.ai/i.test(wire), `an Azure request names xAI: ${wire}`);
  // The Supabase anon key rides on the xAI door only; sending it to a Next route is noise at best.
  assert.ok(!wire.includes("anon-key"), "the Supabase key is being sent to Azure's route");
});

test("🔴 ONE request per utterance — the plan is a single url, never a list", () => {
  // The failure this guards is the one the owner described: a picker that changes providers while
  // something else keeps a second lane warm. A plan that cannot express two calls cannot make two.
  const plan = ttsRequest({ ...BASE, provider: "xai" });
  assert.equal(typeof plan.url, "string");
  assert.ok(!Array.isArray(plan.url));
});

test("🔴 `auto` is omitted rather than sent, so an old caller and a deliberate `auto` still differ", () => {
  const auto = bodyOf(ttsRequest({ ...BASE, locale: "auto", provider: "xai" }).init);
  assert.ok(!("locale" in auto), "auto is being sent explicitly");
  const named = bodyOf(ttsRequest({ ...BASE, locale: "es-MX", provider: "xai" }).init);
  assert.equal(named.locale, "es-MX");
});

test("🔴 the rate on the wire is the SYNTHESIS rate, and the listener's speed never appears", () => {
  // 🔴🔴 The whole of §48: playback speed is `playbackRate` on an element, not an argument to a
  // synthesiser. Calibration: pass a playback rate through here and this reddens.
  const CODE = readFileSync(new URL("./tts-request.ts", import.meta.url), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
  assert.ok(!/playbackRate/.test(CODE), "a playback rate is reaching the provider");
  const plan = ttsRequest({ ...BASE, provider: "azure", locale: "en-US", rate: 1 });
  assert.equal(bodyOf(plan.init).rate, 1);
});

test("🔴 a request always carries the caller's bearer token, on either door", () => {
  for (const provider of ["xai", "azure"] as const) {
    const headers = ttsRequest({ ...BASE, locale: "en-US", provider }).init.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer jwt", `${provider} sends no bearer token`);
  }
});
