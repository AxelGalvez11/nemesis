// Deno unit tests (repo convention) for the kept-reasoning trail.
// Run: deno test --no-check apps/mobile/src/lib/thought-trail.test.ts
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { thinkingFromMeta } from "./chat-threads.ts";
import { thoughtDuration } from "./thought-trail.ts";

Deno.test("a turn's length reads the way a person would say it", () => {
  assertStrictEquals(thoughtDuration(0), "0s");
  assertStrictEquals(thoughtDuration(900), "1s");
  assertStrictEquals(thoughtDuration(12_400), "12s");
  assertStrictEquals(thoughtDuration(59_400), "59s");
  // Rounds up across the minute rather than printing "60s".
  assertStrictEquals(thoughtDuration(59_600), "1m");
  assertStrictEquals(thoughtDuration(60_000), "1m");
  assertStrictEquals(thoughtDuration(64_000), "1m 4s");
  assertStrictEquals(thoughtDuration(125_000), "2m 5s");
  // A clock that has gone backwards must not print a negative duration.
  assertStrictEquals(thoughtDuration(-5_000), "0s");
});

Deno.test("kept reasoning round-trips out of the cloud meta column", () => {
  assertEquals(thinkingFromMeta({ thinking: { ms: 12_000, text: "Comparing the two agents." } }), {
    ms: 12_000,
    text: "Comparing the two agents.",
  });
});

Deno.test("a row without reasoning is not an error — it is the normal quiet case", () => {
  // An Instant turn runs with thinking switched off, the web app does not write
  // this field at all, and rows predate it. None of those is a failure.
  for (const meta of [null, undefined, {}, "nope", 7, { thinking: null }, { thinking: "text" }]) {
    assertStrictEquals(thinkingFromMeta(meta), null);
  }
  // Empty text is nothing to EXPAND — but the settled "Thought for …" row
  // survives it, so a turn that measurably thought and kept no body is still a
  // thinking row with an empty disclosure.
  //
  // 🔴 THIS ASSERTION WAS STALE AND RED ON main. chat-threads.ts deliberately
  // widened the rule on 2026-07-29 (8cf0b96) from `if (!text) return null` to
  // `if (!text && duration <= 0) return null`, and this line was never moved
  // with it — it went on asserting the older "no text means no row at all".
  // Nobody saw it because the CI job that runs the mobile suite was dying two
  // steps earlier on a missing dependency install.
  assertEquals(thinkingFromMeta({ thinking: { ms: 10, text: "   " } }), { ms: 10, text: "" });
  // With no measured duration either, there is genuinely nothing to show.
  assertStrictEquals(thinkingFromMeta({ thinking: { text: "" } }), null);
  assertStrictEquals(thinkingFromMeta({ thinking: { ms: 0, text: "   " } }), null);
});

Deno.test("a missing or broken duration still yields readable reasoning", () => {
  // The text is the point; a bad clock must not suppress it.
  assertEquals(thinkingFromMeta({ thinking: { text: "Some reasoning." } }), { ms: 0, text: "Some reasoning." });
  assertEquals(thinkingFromMeta({ thinking: { ms: "abc", text: "Some reasoning." } }), { ms: 0, text: "Some reasoning." });
  assertEquals(thinkingFromMeta({ thinking: { ms: -3, text: "Some reasoning." } }), { ms: 0, text: "Some reasoning." });
});
