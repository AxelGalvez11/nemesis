// Tests for the fresh-info lane detector (lane-router.ts). The contract under test: fires ONLY on
// current-events / named-person questions with zero biomedical signal, so a false fire can never
// eat a real medical question. Run: deno test supabase/functions/ask/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectFreshInfo } from "./lane-router.ts";

Deno.test("fires on sports-schedule questions (the owner's example)", () => {
  const d = detectFreshInfo("what are the world cup times?");
  assert(d.fires);
  assertEquals(d.reason, "current_events");
});

Deno.test("fires on a bare person lookup (the owner's example)", () => {
  const d = detectFreshInfo("who is Matt Turner");
  assert(d.fires);
  assertEquals(d.reason, "person_lookup");
});

Deno.test("fires on election/results phrasing", () => {
  assert(detectFreshInfo("who won the election").fires);
});

Deno.test("does NOT fire when a known entity is mentioned", () => {
  // "who is <drug>"-shaped: the entity guard must keep it in the evidence pipeline.
  assertEquals(detectFreshInfo("who is ibuprofen").fires, false);
});

Deno.test("does NOT fire on biomedical marker words", () => {
  assertEquals(detectFreshInfo("what are the side effects").fires, false);
  assertEquals(detectFreshInfo("is it safe to take this while pregnant").fires, false);
  assertEquals(detectFreshInfo("who is the best doctor for diabetes").fires, false);
});

Deno.test("does NOT fire on mixed questions that carry any medical context", () => {
  assertEquals(detectFreshInfo("who is Matt Turner and can he take creatine as a supplement").fires, false);
});

Deno.test("does NOT fire on ordinary evidence questions", () => {
  assertEquals(detectFreshInfo("does magnesium help sleep").fires, false);
  assertEquals(detectFreshInfo("is creatine bad for kidneys").fires, false);
});

Deno.test("does NOT fire on empty or very long input", () => {
  assertEquals(detectFreshInfo("").fires, false);
  assertEquals(detectFreshInfo(`who is ${"a".repeat(420)}`).fires, false);
});

Deno.test("does NOT fire on multi-clause person questions (only the bare lookup shape)", () => {
  assertEquals(detectFreshInfo("who is the author of this study on statins").fires, false);
});
