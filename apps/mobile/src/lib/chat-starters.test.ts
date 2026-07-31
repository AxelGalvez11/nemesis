import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { CHAT_STARTERS, starterPrefillIsWellFormed } from "./chat-starters.ts";

Deno.test("there are exactly three starters", () => {
  // Not cosmetic: the chat measures its composer block with these rows in it,
  // and the bottom fade and artifact clearance are derived from that height.
  assertEquals(CHAT_STARTERS.length, 3);
});

Deno.test("every starter's key is unique", () => {
  const keys = new Set(CHAT_STARTERS.map((starter) => starter.key));
  assertEquals(keys.size, CHAT_STARTERS.length);
});

Deno.test("every prefill is either a finished sentence or waiting for a subject", () => {
  for (const starter of CHAT_STARTERS) {
    assert(
      starterPrefillIsWellFormed(starter.prefill),
      `"${starter.prefill}" would read half-written if the student sent it as-is`,
    );
  }
});

Deno.test("a prefill that stops mid-phrase is rejected", () => {
  assertEquals(starterPrefillIsWellFormed("Make flashcards from my note on"), false);
  assertEquals(starterPrefillIsWellFormed(" leading space"), false);
});

Deno.test("a prefill that trails off with a space is accepted", () => {
  assertEquals(starterPrefillIsWellFormed("Make flashcards from my note on "), true);
});

Deno.test("a prefill that ends a sentence is accepted", () => {
  assertEquals(starterPrefillIsWellFormed("What's on my calendar this week?"), true);
  assertEquals(starterPrefillIsWellFormed("Help me organize my library."), true);
  assertEquals(starterPrefillIsWellFormed("Tidy my library!"), true);
});

Deno.test("no starter label names a subject or a field of study", () => {
  // Nemesis is field-agnostic: a law student and a mechanical engineering
  // student have to see the same three rows and both find them useful.
  const subjects = ["pharm", "drug", "medic", "nurs", "biolog", "chem", "law", "engineer"];
  for (const starter of CHAT_STARTERS) {
    const text = `${starter.label} ${starter.prefill}`.toLowerCase();
    for (const subject of subjects) {
      assert(!text.includes(subject), `"${starter.label}" is scoped to one field`);
    }
  }
});
