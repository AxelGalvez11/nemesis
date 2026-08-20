import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { CANVAS_VOICES, DEFAULT_VOICE, readVoice, voiceLabel } from "./canvas-voices";

// 🔴 OWNER, 2026-08-20: *"read out loud works but i want nemesis users to be able to choose the
// voice too."* The product contract already named this gap in §43: *"The voice identity is still
// fixed. `nemesis-speak` sends one `voice_id` for every utterance in every language."*
//
// 🔴🔴 THE HAZARD IS NOT THE PICKER, IT IS THE IDS. xAI answers `GET /v1/voices` with a 404 on our
// key and publishes no list, so a made-up id is not a typo — the provider returns 502 and the
// learner hears nothing, which is indistinguishable from voice mode being broken. The six here were
// measured through the deployed function (`scripts/xai-voices-probe.sh`), with three deliberate
// failures as the calibration.

test("🔴 the default is what every canvas has always spoken in", () => {
  // Changing the default in the same change that adds the choice would silently re-voice the
  // product for everybody who never asked for anything.
  assert.equal(DEFAULT_VOICE, "eve");
  assert.ok(CANVAS_VOICES.some((voice) => voice.id === DEFAULT_VOICE), "the default must be offerable");
});

test("🔴🔴 every offered id is one the probe actually confirmed", () => {
  // The list and the evidence for it must not drift. These are the ids that returned audio on
  // 2026-08-20; `ani`, `thomas` and a nonsense control returned 502 in the same run, which is what
  // makes this a measurement rather than six plausible names.
  assert.deepEqual(
    CANVAS_VOICES.map((voice) => voice.id),
    ["eve", "ara", "rex", "gork", "sal", "leo"],
  );
});

test("🔴🔴 an unknown stored id resolves to the default rather than being sent", () => {
  // If xAI retires a voice, whoever had it selected would otherwise get a 502 on every utterance,
  // with no way to tell that from voice mode being broken — and the setting that caused it three
  // menus away. Calibration: return the raw value from `readVoice` and this reddens.
  assert.equal(readVoice("no-such-voice"), DEFAULT_VOICE);
  assert.equal(readVoice(""), DEFAULT_VOICE);
  assert.equal(readVoice(null), DEFAULT_VOICE);
  assert.equal(readVoice("  ara  "), "ara", "a stored value is trimmed, not rejected");
});

test("a chosen id survives the round trip", () => {
  for (const voice of CANVAS_VOICES) assert.equal(readVoice(voice.id), voice.id);
});

test("every voice has a label, and an unknown one still labels safely", () => {
  for (const voice of CANVAS_VOICES) assert.ok(voice.label.length > 0, voice.id);
  assert.equal(voiceLabel("no-such-voice"), "Eve");
});

// ── The far side of the same guard ──────────────────────────────────────────

const FUNCTION = readFileSync(new URL("../../../../supabase/functions/nemesis-speak/index.ts", import.meta.url), "utf8");

test("🔴🔴 the function falls back too, and does not trust the id it is handed", () => {
  // A caller is anybody holding a bearer token, and the value goes straight into a provider request
  // body. Both sides guard: the client's is reachable without a network round trip, the function's
  // is the one that cannot be bypassed by a hand-written fetch.
  assert.match(FUNCTION, /const DEFAULT_VOICE = "eve";/);
  assert.match(FUNCTION, /\/\^\[a-zA-Z0-9_-\]\{1,64\}\$\//, "the id is not shape-checked before it is sent");
  assert.match(FUNCTION, /voice_id: voice,/, "the function still sends a hardcoded voice");
  assert.ok(!/voice_id: "eve"/.test(FUNCTION), "the fixed voice is back");
});

test("🔴 the dead catalogue proxy is gone, and why is recorded", () => {
  // It was written, deployed, called, and answered 404. A proxy to an endpoint that does not exist
  // is the dormant-lane shape this codebase keeps finding; what survives is the finding.
  //
  // 🔴 COMMENTS STRIPPED FIRST, AND THE FIRST VERSION OF THIS TEST DID NOT — it went red against the
  // correct code, because the comment explaining why the proxy was removed necessarily NAMES the
  // endpoint it removed. That is the exact "a guard that matches its own warning" failure this
  // directory's other guards already carry a stripper for.
  const code = FUNCTION.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(code.length > FUNCTION.length * 0.3, "the stripper ate the file; this would pass by reading nothing");
  assert.ok(!/api\.x\.ai\/v1\/voices/.test(code), "the function still proxies an endpoint that 404s");
  assert.match(FUNCTION, /404/, "the reason the catalogue is hardcoded is no longer written down");
});
