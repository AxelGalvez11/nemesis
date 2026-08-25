// The model does not get to say where things are on screen.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { stripScreenPositions } from "./screen-positions";

test("🔴🔴🔴 the two sentences production actually produced", () => {
  // Both measured on the live app, 2026-08-25. The first is the one the owner caught — the quiz
  // was BELOW while the reply said above. The second came back on the very next run, AFTER the
  // contract had been told in capitals never to do this.
  assert.equal(
    stripScreenPositions("The quiz above will test you on these parts."),
    "The quiz will test you on these parts.",
  );
  assert.equal(
    stripScreenPositions("Now, try the questions below. There's also a labelled diagram."),
    "Now, try the questions. There's also a labelled diagram.",
  );
});

test("🔴🔴 punctuation closes up, so no sentence is left with a floating full stop", () => {
  assert.equal(stripScreenPositions("Try the questions below."), "Try the questions.");
  assert.equal(stripScreenPositions("See the diagram above, then answer."), "See the diagram, then answer.");
  assert.equal(stripScreenPositions("the card below: name it"), "the card: name it");
});

test("🔴🔴 every placement word, not just the two that were caught", () => {
  for (const placed of [
    "the diagram above",
    "the diagram below",
    "the diagram just below",
    "the diagram underneath",
    "the diagram beneath",
    "the diagram to the right",
    "the diagram on the left",
    "the diagram here",
  ]) {
    assert.equal(stripScreenPositions(placed), "the diagram", `"${placed}" kept its placement`);
  }
});

test("🔴🔴🔴 a fact about the WORLD is never touched — the noun has to come first", () => {
  // 🔴 THE FAILURE THIS RULE IS SHAPED TO AVOID. Matching a bare "below" would eat real teaching:
  // temperatures, altitudes, anatomy, ranks. The word only goes when it is placing one of the
  // things this product draws on the page.
  for (const real of [
    "the temperature below freezing",
    "everything below the diaphragm drains here",
    "the layer below is older rock",
    "voltage above the threshold",
    "the tier above in the hierarchy",
    "hold your hand above the flame",
    "the court below found for the plaintiff",
  ]) {
    assert.equal(stripScreenPositions(real), real, `"${real}" was edited`);
  }
});

test("🔴🔴 interface nouns only, never subject-matter ones (CLAUDE.md)", () => {
  // "questions", "diagram", "card" mean the same thing to a law student and a mechanical engineer.
  // A geology lesson saying "the layer below" is untouched because `layer` is not something the
  // canvas draws.
  assert.equal(stripScreenPositions("the stratum below"), "the stratum below");
  assert.equal(stripScreenPositions("the muscle beneath"), "the muscle beneath");
  // …and a real one still goes, in a sentence about anything at all.
  assert.equal(stripScreenPositions("the Bundesrat sits above, see the table below"), "the Bundesrat sits above, see the table");
});

test("🔴🔴🔴 it is actually WIRED, on the one line every reply passes through", () => {
  // 🔴 THE LINK THAT KILLED `figure` FOR WEEKS: built, correct, and never called. `say` is where
  // every turn's prose lands, whether it came from outside the block or was recovered from inside
  // it, so stripping there covers both shapes with one call.
  const router = readFileSync(new URL("./turn-router.ts", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(router, /const say = stripScreenPositions\(outside \|\| asText\(parsed\.say\)\)/, "the reply prose is no longer cleaned");
  assert.match(router, /from "\.\/screen-positions"/, "the import is gone");
});

test("🔴 prose with nothing to fix comes back byte-identical", () => {
  const clean = "The neuron is the basic signalling unit. Dendrites receive, the axon sends.";
  assert.equal(stripScreenPositions(clean), clean);
  assert.equal(stripScreenPositions(""), "");
});

console.log("screen-positions.test.ts OK");
