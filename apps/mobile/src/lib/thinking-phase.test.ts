// Deno unit tests (repo convention) for the chat thinking-preview phrases.
// Run: deno test --no-check apps/mobile/src/lib/thinking-phase.test.ts
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { phaseLabel, settledLabel, shortQuery } from "./thinking-phase.ts";

Deno.test("each phase reads as a plain-English line", () => {
  assertEquals(phaseLabel({ kind: "routing" }), "Working out how to answer");
  assertEquals(phaseLabel({ kind: "thinking", deep: true }), "Thinking it through");
  assertEquals(phaseLabel({ kind: "thinking", deep: false }), "Putting this together");
});

Deno.test("reading a photo gets a line, not silence", () => {
  // The photo wait happens BEFORE the turn is sent, and it used to have its own
  // label in its own style on the wrong side of the screen. It reads as one of
  // these now, so it must have a phrase — an empty string would leave the
  // student watching a still picture with nothing happening on it.
  assertStrictEquals(phaseLabel({ kind: "reading-photo" }), "Reading your photo");
});

Deno.test("the search line echoes the real question back", () => {
  assertEquals(
    phaseLabel({ kind: "searching", query: "metformin dosing in renal impairment" }),
    "Searching the web for “metformin dosing in renal impairment”",
  );
});

Deno.test("a blank query still produces a sensible search line", () => {
  assertEquals(phaseLabel({ kind: "searching", query: "   " }), "Searching the web");
});

Deno.test("source counts are singular/plural correct", () => {
  assertEquals(phaseLabel({ kind: "reading", sources: 1 }), "Reading 1 source");
  assertEquals(phaseLabel({ kind: "reading", sources: 6 }), "Reading 6 sources");
});

Deno.test("finding nothing says so instead of claiming to read sources", () => {
  const label = phaseLabel({ kind: "reading", sources: 0 });
  assertEquals(label, "No sources came back — answering from what I know");
});

Deno.test("the writing phase shows nothing — the answer speaks for itself", () => {
  assertEquals(phaseLabel({ kind: "writing" }), "");
});

Deno.test("shortQuery collapses whitespace and leaves short questions alone", () => {
  assertEquals(shortQuery("  what   is\n a beta blocker "), "what is a beta blocker");
});

Deno.test("shortQuery trims long questions at a word boundary", () => {
  const long = "compare the cardiovascular outcomes of ACE inhibitors versus angiotensin receptor blockers";
  const out = shortQuery(long);
  assertEquals(out.endsWith("…"), true);
  assertEquals(out.length <= 43, true, `too long: ${out.length}`);
  // Cut at a space, so the echo never ends mid-word.
  assertEquals(long.startsWith(out.slice(0, -1)), true);
});

Deno.test("shortQuery on a single very long word still fits", () => {
  const out = shortQuery("a".repeat(80));
  assertEquals(out.length <= 43, true);
  assertEquals(out.endsWith("…"), true);
});

Deno.test("settled label rounds seconds and stays quiet on instant turns", () => {
  assertEquals(settledLabel(0), "");
  assertEquals(settledLabel(400), "");
  assertEquals(settledLabel(1000), "Thought for 1s");
  assertEquals(settledLabel(6400), "Thought for 6s");
});

// ── the workspace-tool phase ─────────────────────────────────────────────────

Deno.test("a running tool says what it is doing, in the student's words", () => {
  assertStrictEquals(phaseLabel({ kind: "acting", tools: ["add_flashcards"] }), "Making your flashcards");
  assertStrictEquals(phaseLabel({ kind: "acting", tools: ["add_practice_test"] }), "Writing your practice test");
  assertStrictEquals(phaseLabel({ kind: "acting", tools: ["search_library"] }), "Looking through your library");
});

Deno.test("several tools at once get one honest line, not three stacked phrases", () => {
  // Naming only the first would imply it is the only thing happening; naming all
  // three would not fit on the line.
  assertStrictEquals(
    phaseLabel({ kind: "acting", tools: ["search_library", "add_flashcards"] }),
    "Working in your workspace",
  );
});

Deno.test("an unrecognised or missing tool never shows a function name", () => {
  assertStrictEquals(phaseLabel({ kind: "acting", tools: [] }), "Working in your workspace");
  assertStrictEquals(phaseLabel({ kind: "acting", tools: ["some_new_tool"] }), "Working in your workspace");
});
