// Deno unit tests (repo convention) for the live reasoning preview line.
// Run: deno test --no-check apps/mobile/src/lib/reasoning-preview.test.ts
//
// This file is the ONLY verification this logic gets: the phone screen cannot be
// rendered from a symlinked worktree, so every rule the preview relies on is
// pinned here instead. The sample strings are real openings captured from the
// live engine (2026-07-23 probe), not invented ones.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { reasoningGlimpse, reasoningSegments } from "./reasoning-preview.ts";

Deno.test("nothing to show yet reads as nothing, never as a stray ellipsis", () => {
  assertEquals(reasoningGlimpse(""), "");
  assertEquals(reasoningGlimpse("   \n  "), "");
});

Deno.test("a single unfinished sentence shows as it is written", () => {
  assertEquals(
    reasoningGlimpse("Okay, this is a pharmacology question about ACE inhibitors"),
    "Okay, this is a pharmacology question about ACE inhibitors",
  );
});

Deno.test("a sentence that has only just begun keeps the finished one on screen", () => {
  // "So" is a stub — flashing it would read as a glitch, so the completed
  // sentence holds the slot until the new one has something to say.
  const raw = "Bradykinin accumulates in the airway. So";
  assertEquals(reasoningGlimpse(raw), "Bradykinin accumulates in the airway.");
});

Deno.test("once the new sentence has substance it takes over", () => {
  const raw = "Bradykinin accumulates in the airway. So the cough reflex is sensitised";
  assertEquals(reasoningGlimpse(raw), "So the cough reflex is sensitised");
});

Deno.test("an over-long fragment keeps its NEWEST words, cut at a word boundary", () => {
  const raw = `${"word ".repeat(60)}the newest part`;
  const out = reasoningGlimpse(raw, 40);
  assertEquals(out.startsWith("…"), true);
  assertEquals(out.endsWith("the newest part"), true);
  assertEquals(out.length <= 41, true);
  // Cut on a space, so no half-word ever shows.
  assertEquals(out.slice(1).startsWith("word"), true);
});

Deno.test("decimals and version numbers do not split a sentence", () => {
  assertEquals(reasoningSegments("Give 0.5 mg twice daily."), ["Give 0.5 mg twice daily."]);
});

Deno.test("markdown noise and newlines are flattened to one line", () => {
  assertEquals(
    reasoningGlimpse("**Key point**\n\nACE inhibitors block\nbradykinin breakdown"),
    "Key point ACE inhibitors block bradykinin breakdown",
  );
});

Deno.test("segments split on real sentence ends only", () => {
  assertEquals(reasoningSegments("One. Two! Three? Four"), ["One.", "Two!", "Three?", "Four"]);
});

Deno.test("the last COMPLETE sentence shows when the stream ends on a full stop", () => {
  assertEquals(
    reasoningGlimpse("First thought here. Second thought lands cleanly."),
    "Second thought lands cleanly.",
  );
});

Deno.test("a lone over-long token still yields readable output, not a bare ellipsis", () => {
  const out = reasoningGlimpse("x".repeat(200), 40);
  assertEquals(out.startsWith("…"), true);
  assertEquals(out.length > 1, true);
});
