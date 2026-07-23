// Deno unit tests (repo convention) for the on-device speech model's gate.
// Run: deno test --no-check apps/mobile/src/lib/asr-model.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  nextModelState,
  planAsrModel,
  readStoredModelState,
  storedValueFor,
  type AsrModelSituation,
} from "./asr-model.ts";

const onWifi: AsrModelSituation = { state: "absent", supported: true, unmetered: true };

Deno.test("a downloaded model is simply used", () => {
  assertEquals(planAsrModel({ ...onWifi, state: "ready" }), "use");
});

Deno.test("a missing model downloads on wifi", () => {
  assertEquals(planAsrModel(onWifi), "download");
});

Deno.test("a few hundred MB never leaves on cellular or an unknown connection", () => {
  assertEquals(planAsrModel({ ...onWifi, unmetered: false }), "fallback");
});

Deno.test("a download in flight waits instead of starting a second one", () => {
  assertEquals(planAsrModel({ ...onWifi, state: "downloading" }), "wait");
});

Deno.test("a failed download does not retry by itself", () => {
  assertEquals(planAsrModel({ ...onWifi, state: "failed" }), "fallback");
});

Deno.test("a failed download retries only when asked, and only on wifi", () => {
  assertEquals(planAsrModel({ ...onWifi, state: "failed", retryRequested: true }), "download");
  assertEquals(
    planAsrModel({ ...onWifi, state: "failed", retryRequested: true, unmetered: false }),
    "fallback",
  );
});

Deno.test("an unsupported phone always falls back, whatever the model says", () => {
  for (const state of ["absent", "downloading", "ready", "failed"] as const) {
    assertEquals(planAsrModel({ ...onWifi, state, supported: false }), "fallback", state);
  }
});

Deno.test("the plan never refuses to record", () => {
  // Every combination must resolve to something the recorder can act on.
  const actions = new Set<string>();
  for (const state of ["absent", "downloading", "ready", "failed"] as const) {
    for (const supported of [true, false]) {
      for (const unmetered of [true, false]) {
        for (const retryRequested of [true, false]) {
          actions.add(planAsrModel({ state, supported, unmetered, retryRequested }));
        }
      }
    }
  }
  for (const action of actions) {
    assertEquals(["use", "download", "wait", "fallback"].includes(action), true, action);
  }
});

Deno.test("state transitions", () => {
  assertEquals(nextModelState("absent", "start"), "downloading");
  assertEquals(nextModelState("downloading", "start"), "downloading");
  assertEquals(nextModelState("downloading", "success"), "ready");
  assertEquals(nextModelState("downloading", "failure"), "failed");
});

Deno.test("only an exact stored marker counts as downloaded", () => {
  assertEquals(readStoredModelState("ready"), "ready");
  // A corrupt or half-written entry must re-download, not pretend.
  assertEquals(readStoredModelState("read"), "absent");
  assertEquals(readStoredModelState(""), "absent");
  assertEquals(readStoredModelState(null), "absent");
  assertEquals(readStoredModelState(undefined), "absent");
});

Deno.test("only the ready state is persisted", () => {
  assertEquals(storedValueFor("ready"), "ready");
  for (const state of ["absent", "downloading", "failed"] as const) {
    assertEquals(storedValueFor(state), null, state);
  }
});
