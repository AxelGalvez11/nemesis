// A boundary that now has a provider behind it, held to still saying when it does not.
//
// 🔴 THE TEST THIS FILE EXISTS TO BE is unchanged from the day it was written: `the gap is named,
// never an empty success`. An assessment returning `{ ok: true, evidence: {} }` would be read
// downstream as "measured, and everything was fine" — a confident zero in a learner's record for
// something nobody measured. Azure landing did not retire that risk; it moved it, from "no provider
// exists" to "this deployment has no key".

import assert from "node:assert/strict";
import test from "node:test";

import { pronunciationTeachingAvailable } from "./pronunciation-evidence";
import { assessPronunciation } from "@/lib/speech/pronunciation";

const NO_KEYS = { ASSEMBLYAI_API_KEY: false, AZURE_SPEECH_KEY: false, XAI_API_KEY: false };

test("🔴 the gap is named, never an empty success", async () => {
  const result = await assessPronunciation(
    {
      env: {},
      fetch: (() => {
        throw new Error("a provider was called with no credential");
      }) as unknown as typeof fetch,
    },
    { audio: new ArrayBuffer(8_000), contentType: "audio/webm", locale: "es-MX", referenceText: "hola" },
  );
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "no-provider");
  assert.match(result.ok === false ? result.detail : "", /hear what was said, not how/);
});

test("🔴 no surface may claim to teach pronunciation where nothing can measure it", () => {
  // §43's rule, now a function of the deployment rather than of the roadmap: a preview build with no
  // Azure credential must still be honest, and a constant hard-coded to `true` the day the provider
  // landed would lie on every environment that has not been configured.
  assert.equal(pronunciationTeachingAvailable(NO_KEYS), false);
  assert.equal(pronunciationTeachingAvailable({ ...NO_KEYS, AZURE_SPEECH_KEY: true }), true);
});
