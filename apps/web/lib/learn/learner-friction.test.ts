import assert from "node:assert/strict";
import { test } from "node:test";

import { knownDefinition, lookupCounts, terminologyFriction, termsInTheWay } from "./learner-friction";
import type { TermLookup } from "./learner-friction";

const at = (term: string, occurredAt: string, definition: string | null = "a definition"): TermLookup => ({
  definition,
  occurredAt,
  term,
});

test("🔴 counting folds the same term written differently", () => {
  // The learner drags across "Reading Frame" on one slide and "reading frame," on another. Those are
  // one term needed twice, not two terms needed once — and the difference is the whole signal.
  const counts = lookupCounts([
    at("Reading Frame", "2026-08-14T10:00:00.000Z"),
    at("reading frame,", "2026-08-14T11:00:00.000Z"),
  ]);
  assert.equal(counts.get("reading frame"), 2);
});

test("🔴🔴 one lookup is curiosity; the second is the signal", () => {
  // 🔴 THE THRESHOLD IS THE POINT. Acting on a single lookup would treat every unfamiliar word as a
  // difficulty; waiting longer would let a learner be beaten by the same word three times first.
  const once = [at("codon", "2026-08-14T10:00:00.000Z")];
  assert.deepEqual(termsInTheWay(once, ["codon"]), [], "asked once, told once — nothing to act on");

  const twice = [...once, at("codon", "2026-08-14T12:00:00.000Z")];
  assert.deepEqual(termsInTheWay(twice, ["codon"]), ["codon"], "needed again after being told");
});

test("terms the learner never looked up are not friction", () => {
  const lookups = [at("codon", "2026-08-14T10:00:00.000Z"), at("codon", "2026-08-14T12:00:00.000Z")];
  assert.deepEqual(termsInTheWay(lookups, ["resistance", "current"]), []);
});

test("🔴 a term asked for twice and never answered is STILL friction", () => {
  // 🔴 OTHERWISE THE SIGNAL MEASURES OUR AVAILABILITY, NOT THEIR DIFFICULTY. A learner who asked
  // twice and got nothing back is having a harder time than one who asked twice and was told — so
  // counting only the answered lookups would make Nemesis least responsive exactly when it failed.
  const unanswered = [
    at("Grenzfläche", "2026-08-14T10:00:00.000Z", null),
    at("Grenzfläche", "2026-08-14T12:00:00.000Z", null),
  ];
  assert.equal(terminologyFriction({ lookups: unanswered, terms: ["Grenzfläche"] }).present, true);
});

// ── the glossary half: "provide the definition in the future" ───────────────

test("🔴🔴 a definition the learner was already given comes back", () => {
  // The owner's own request: "have nemesis keep track of that to provide the definition in the
  // future." The second encounter with a term should not cost another model call.
  const lookups = [at("codon", "2026-08-14T10:00:00.000Z", "three bases that specify one amino acid")];
  assert.equal(
    knownDefinition(lookups, "Codon")?.definition,
    "three bases that specify one amino acid",
    "and it folds case, because the learner's second drag will not match their first",
  );
});

test("🔴 the most recent definition wins", () => {
  const lookups = [
    at("codon", "2026-08-14T10:00:00.000Z", "an old, worse definition"),
    at("codon", "2026-08-14T12:00:00.000Z", "a better one"),
  ];
  assert.equal(knownDefinition(lookups, "codon")?.definition, "a better one");
});

test("🔴 an unanswered lookup is never reused AS the definition", () => {
  // A row with no definition records that they asked and we did not answer. Handing that back would
  // show a learner a blank where they had previously been told something perfectly good.
  const lookups = [
    at("codon", "2026-08-14T10:00:00.000Z", "three bases that specify one amino acid"),
    at("codon", "2026-08-14T12:00:00.000Z", null),
  ];
  assert.equal(knownDefinition(lookups, "codon")?.definition, "three bases that specify one amino acid");
  assert.equal(knownDefinition([at("x", "2026-08-14T10:00:00.000Z", null)], "x"), null);
});

test("a term with no lookups has no definition, rather than an empty one", () => {
  assert.equal(knownDefinition([], "codon"), null);
});

test("🔴 works in any script, because the key does", () => {
  // The frequency rule in `vocabulary-lookup.ts` is language-agnostic by construction; the store
  // that remembers its results has to be too, or the feature works in English and forgets elsewhere.
  const lookups = [at("読み枠", "2026-08-14T10:00:00.000Z"), at("読み枠", "2026-08-14T12:00:00.000Z")];
  assert.deepEqual(termsInTheWay(lookups, ["読み枠"]), ["読み枠"]);
});

test("duplicate terms in the question are answered once", () => {
  const lookups = [at("codon", "2026-08-14T10:00:00.000Z"), at("codon", "2026-08-14T12:00:00.000Z")];
  assert.deepEqual(termsInTheWay(lookups, ["codon", "Codon", "codon,"]), ["codon"]);
});
