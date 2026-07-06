// Tests for the fresh-info lane detector (lane-router.ts). The contract under test: fires ONLY on
// current-events / named-person questions with zero biomedical signal, so a false fire can never
// eat a real medical question. Run: deno test supabase/functions/ask/
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { detectFreshInfo, detectGeneralAssistant } from "./lane-router.ts";

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

// ---------------------------------------------------------------------------
// Lane 0.6 — general-assistant detector. Contract: fires ONLY on a clearly non-medical general
// TASK (positive signal), NEVER on a medical question. A false fire (answering a medical question
// without the safety scan) is the failure mode; every case here locks the fail-safe behavior.
// ---------------------------------------------------------------------------

Deno.test("general lane fires on the owner's example (cover letter)", () => {
  const d = detectGeneralAssistant("help me write a cover letter");
  assert(d.fires);
  assertEquals(d.reason, "general_task");
});

Deno.test("general lane fires on common non-medical tasks", () => {
  assert(detectGeneralAssistant("write me an email to my landlord").fires);
  assert(detectGeneralAssistant("draft a resume for a marketing job").fires);
  assert(detectGeneralAssistant("can you help me write a poem for my mom").fires);
  assert(detectGeneralAssistant("translate this to Spanish").fires);
  assert(detectGeneralAssistant("what is the capital of France").fires);
});

Deno.test("general lane does NOT fire on any medical question (the core safety property)", () => {
  // These have no general-task verb+object, OR carry a biomedical marker/entity → must go to engine.
  assertEquals(detectGeneralAssistant("why is my skin itchy").fires, false);
  assertEquals(detectGeneralAssistant("is ibuprofen safe with lisinopril").fires, false);
  assertEquals(detectGeneralAssistant("what are the side effects of metformin").fires, false);
  assertEquals(detectGeneralAssistant("does magnesium help sleep").fires, false);
});

Deno.test("general lane does NOT fire when a medical topic borrows a task verb", () => {
  // "write me a summary of the statin evidence" / "make a plan to lower cholesterol" carry medical
  // markers (statin/evidence/cholesterol) → BIOMEDICAL_MARKERS disqualifies → engine, with citations.
  assertEquals(detectGeneralAssistant("write me a summary of the statin evidence").fires, false);
  assertEquals(detectGeneralAssistant("make a plan to lower my cholesterol").fires, false);
  assertEquals(detectGeneralAssistant("draft an email to my doctor about my symptoms").fires, false);
});

Deno.test("general lane excludes health-adjacent make-tasks (meal plan / workout)", () => {
  // Deliberately NOT in the object list — these may carry real health content, belong in the engine.
  assertEquals(detectGeneralAssistant("make me a meal plan").fires, false);
  assertEquals(detectGeneralAssistant("build me a workout routine").fires, false);
});

Deno.test("general lane does not fire on empty/very long input, or fresh-info shapes", () => {
  assertEquals(detectGeneralAssistant("").fires, false);
  assertEquals(detectGeneralAssistant(`write a poem ${"x".repeat(520)}`).fires, false);
  assertEquals(detectGeneralAssistant("who is Matt Turner").fires, false); // fresh-info lane owns this
});
