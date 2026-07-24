import assert from "node:assert/strict";

import { reasoningGlimpse, reasoningSegments } from "./reasoning-preview";

// Parity with the phone (apps/mobile/src/lib/reasoning-preview.test.ts). The
// sample strings are real openings captured from the live engine, not invented.

// Nothing to show yet reads as nothing, never as a stray ellipsis.
assert.equal(reasoningGlimpse(""), "");
assert.equal(reasoningGlimpse("   \n  "), "");

// A single unfinished sentence shows as it is written.
assert.equal(
  reasoningGlimpse("Okay, this is a pharmacology question about ACE inhibitors"),
  "Okay, this is a pharmacology question about ACE inhibitors",
);

// A sentence that has only just begun keeps the finished one on screen.
assert.equal(
  reasoningGlimpse("Bradykinin accumulates in the airway. So"),
  "Bradykinin accumulates in the airway.",
);

// Once the new sentence has substance it takes over.
assert.equal(
  reasoningGlimpse("Bradykinin accumulates in the airway. So the cough reflex is sensitised"),
  "So the cough reflex is sensitised",
);

// An over-long fragment keeps its NEWEST words, cut at a word boundary.
{
  const raw = `${"word ".repeat(60)}the newest part`;
  const out = reasoningGlimpse(raw, 40);
  assert.equal(out.startsWith("…"), true);
  assert.equal(out.endsWith("the newest part"), true);
  assert.equal(out.length <= 41, true);
  assert.equal(out.slice(1).startsWith("word"), true);
}

// Decimals and version numbers do not split a sentence.
assert.deepEqual(reasoningSegments("Give 0.5 mg twice daily."), ["Give 0.5 mg twice daily."]);

// Markdown noise and newlines are flattened to one line.
assert.equal(
  reasoningGlimpse("**Key point**\n\nACE inhibitors block\nbradykinin breakdown"),
  "Key point ACE inhibitors block bradykinin breakdown",
);

// Comparison operators SURVIVE the markdown clean-up (regression: stripping
// "greater than" turns a threshold into a bare number, silently).
assert.equal(
  reasoningGlimpse("Keep SBP > 140 and CrCl > 50 in range."),
  "Keep SBP > 140 and CrCl > 50 in range.",
);
assert.equal(reasoningGlimpse("The half_life value matters here"), "The half_life value matters here");

// Segments split on real sentence ends only.
assert.deepEqual(reasoningSegments("One. Two! Three? Four"), ["One.", "Two!", "Three?", "Four"]);

// The last COMPLETE sentence shows when the stream ends on a full stop.
assert.equal(
  reasoningGlimpse("First thought here. Second thought lands cleanly."),
  "Second thought lands cleanly.",
);

// A lone over-long token still yields readable output, not a bare ellipsis.
{
  const out = reasoningGlimpse("x".repeat(200), 40);
  assert.equal(out.startsWith("…"), true);
  assert.equal(out.length > 1, true);
}

console.log("reasoning-preview.test.ts OK");
