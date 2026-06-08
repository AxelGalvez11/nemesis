// Deno unit tests for the PostHog adapter. Run: deno test --no-check apps/mobile/src/lib/posthogSink.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makePostHogSink, type PostHogClient } from "./posthogSink.ts";
import { capture, configureAnalytics, identify, resetAnalyticsSink, setOptOut } from "./analytics.ts";

function mockClient() {
  const calls: Array<{ m: string; a: unknown[] }> = [];
  const client: PostHogClient = {
    capture: (...a) => calls.push({ m: "capture", a }),
    identify: (...a) => calls.push({ m: "identify", a }),
    reset: () => calls.push({ m: "reset", a: [] }),
    flush: () => {
      calls.push({ m: "flush", a: [] });
      return Promise.resolve();
    },
  };
  return { client, calls };
}

Deno.test("makePostHogSink forwards capture/identify/reset to the client", () => {
  const { client, calls } = mockClient();
  const sink = makePostHogSink(client);
  sink.capture("answer_viewed", { evidence_grade: "strong" });
  sink.identify?.("user-1", { plan: "pro" });
  sink.reset?.();
  assertEquals(calls, [
    { m: "capture", a: ["answer_viewed", { evidence_grade: "strong" }] },
    { m: "identify", a: ["user-1", { plan: "pro" }] },
    { m: "reset", a: [] },
  ]);
});

Deno.test("end-to-end: core capture() privacy-sanitizes before reaching the PostHog client", () => {
  resetAnalyticsSink();
  setOptOut(false);
  const { client, calls } = mockClient();
  configureAnalytics(makePostHogSink(client));
  // health detail + a drug name on entity_id must be stripped by the core before PostHog sees it
  capture("ask_question_submitted", {
    intent: "drug_interaction",
    question: "can I take ibuprofen with warfarin",
    medications: ["warfarin"],
    entity_id: "warfarin",
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0], { m: "capture", a: ["ask_question_submitted", { intent: "drug_interaction" }] });
  resetAnalyticsSink();
});
