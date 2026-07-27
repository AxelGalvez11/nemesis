// Deno unit tests (repo convention) for which transcription engine the Record
// screen uses. Run: deno test --no-check apps/mobile/src/lib/asr-engine.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  asrEngineReason,
  selectAsrEngine,
  shouldDownloadAsrModel,
  type AsrCapability,
} from "./asr-engine.ts";

/** An iPhone on a build that ships the module, model already downloaded. */
const ready: AsrCapability = {
  platform: "ios",
  nativeAvailable: true,
  modelState: "ready",
  unmetered: true,
};

Deno.test("a ready iPhone uses parakeet", () => {
  assertEquals(selectAsrEngine(ready), "parakeet");
});

Deno.test("Android always uses the platform engine", () => {
  // FluidAudio is Apple-only. Android keeps expo-speech-recognition, which is
  // not a regression — it is what Android has today.
  assertEquals(selectAsrEngine({ ...ready, platform: "android" }), "apple");
  assertEquals(selectAsrEngine({ ...ready, platform: "android", override: "parakeet" }), "apple");
});

Deno.test("a build without the native module uses the platform engine", () => {
  // THE OTA CASE. Every build before the module shipped runs this JS. If the
  // selector trusted the flag alone, an OTA onto build 19 would try to call a
  // module that isn't linked and kill recording outright.
  assertEquals(selectAsrEngine({ ...ready, nativeAvailable: false }), "apple");
  assertEquals(selectAsrEngine({ ...ready, nativeAvailable: false, override: "parakeet" }), "apple");
});

Deno.test("an unready model falls back rather than blocking the recording", () => {
  for (const modelState of ["absent", "downloading", "failed"] as const) {
    assertEquals(selectAsrEngine({ ...ready, modelState }), "apple", `modelState=${modelState}`);
  }
});

Deno.test("an override can force the platform engine on a ready iPhone", () => {
  assertEquals(selectAsrEngine({ ...ready, override: "apple" }), "apple");
});

Deno.test("an override can never select an engine that cannot run", () => {
  // An override is a debug lever, not a way to brick the recorder.
  assertEquals(selectAsrEngine({ ...ready, modelState: "absent", override: "parakeet" }), "apple");
});

Deno.test("the model downloads only when it is missing, supported, and unmetered", () => {
  assert(shouldDownloadAsrModel({ ...ready, modelState: "absent" }));
  assertEquals(shouldDownloadAsrModel(ready), false, "already ready");
  assertEquals(shouldDownloadAsrModel({ ...ready, modelState: "downloading" }), false, "in flight");
  assertEquals(shouldDownloadAsrModel({ ...ready, modelState: "absent", platform: "android" }), false);
  assertEquals(shouldDownloadAsrModel({ ...ready, modelState: "absent", nativeAvailable: false }), false);
});

Deno.test("a few hundred MB never downloads silently on cellular", () => {
  assertEquals(shouldDownloadAsrModel({ ...ready, modelState: "absent", unmetered: false }), false);
  // Unknown connection is treated as unmetered only when explicitly stated.
  assertEquals(shouldDownloadAsrModel({ ...ready, modelState: "absent", unmetered: undefined }), false);
});

Deno.test("a failed download does not silently retry on every recording", () => {
  // Retrying a large download automatically, every time the user taps record,
  // is how a phone plan gets eaten. Retry is an explicit action.
  assertEquals(shouldDownloadAsrModel({ ...ready, modelState: "failed" }), false);
});

Deno.test("the reason line names the actual blocker", () => {
  assert(asrEngineReason({ ...ready, platform: "android" }).includes("Android"));
  assert(asrEngineReason({ ...ready, nativeAvailable: false }).toLowerCase().includes("update"));
  assert(asrEngineReason({ ...ready, modelState: "downloading" }).toLowerCase().includes("download"));
  assert(asrEngineReason({ ...ready, modelState: "failed" }).toLowerCase().includes("fail"));
  assert(asrEngineReason(ready).toLowerCase().includes("on-device"));
});
