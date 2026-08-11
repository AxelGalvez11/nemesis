import assert from "node:assert/strict";
import { test } from "node:test";

import {
  identityBasis,
  identityIsStructural,
  isSameKnowledge,
  knowledgeIdentityKey,
  normalizeForIdentity,
} from "./knowledge-identity";
import type { KnowledgeObject } from "./knowledge-types";

function association(left: string, right: string, over: Partial<KnowledgeObject> = {}): KnowledgeObject {
  return {
    id: "k1",
    pair: { id: "p1", left, right },
    statement: `${left} — ${right}`,
    type: "association",
    ...over,
  };
}

// ── the collision case: the same knowledge, met twice ───────────────────────
//
// 🔴 THIS IS THE TEST THAT DECIDES WHETHER CROSS-SESSION ADAPTATION CAN EVER WORK. If it fails,
// Session B mints a new key for what Session A already taught, finds no prior evidence, and
// teaches from scratch — while looking exactly like a policy that is not adapting.

test("the same pair in two different documents is ONE piece of knowledge", () => {
  const fromLecture = association("Losartan", "Cozaar", { id: "k-lecture" });
  const fromRevisionSheet = association("Losartan", "Cozaar", { id: "k-revision" });
  assert.equal(isSameKnowledge(fromLecture, fromRevisionSheet), true);
});

test("nothing about the document reaches the key — not its id, its block, or its position", () => {
  const a = association("France", "Paris", {
    conceptIds: ["c-europe"],
    id: "k-a",
    sourceRefs: [{ excerptId: "s1:e3", sourceId: "s1" }],
  });
  const b = association("France", "Paris", {
    conceptIds: ["c-capitals"],
    id: "k-b",
    sourceRefs: [{ excerptId: "s9:e142", sourceId: "s9" }],
  });
  assert.equal(knowledgeIdentityKey(a), knowledgeIdentityKey(b));
});

test("which side the document led with does not change the knowledge", () => {
  // A glossary lists term then definition; a quiz sheet lists the answer then the term.
  assert.equal(isSameKnowledge(association("France", "Paris"), association("Paris", "France")), true);
});

test("formatting differences are formatting, not different knowledge", () => {
  assert.equal(isSameKnowledge(association("Losartan", "Cozaar"), association(" losartan ", "COZAAR.")), true);
});

// ── the near-miss case: neighbours that must NOT merge ──────────────────────
//
// 🔴 THE OPPOSITE FAILURE, AND THE WORSE ONE. A key loose enough to merge these would credit a
// learner with knowing something they have never been asked — and confusable neighbours are
// exactly the pairs a learner actually gets wrong, so this is where a sloppy key does most damage.

test("two drugs in the same class with different brands are two pieces of knowledge", () => {
  assert.equal(isSameKnowledge(association("Losartan", "Cozaar"), association("Valsartan", "Diovan")), false);
});

test("the same cue with a different answer is not the same knowledge", () => {
  // "losartan → Cozaar" (its brand) and "losartan → an angiotensin receptor blocker" (its class)
  // are different things to know. A key computed from the cue alone would merge them.
  const brand = association("Losartan", "Cozaar");
  const klass = association("Losartan", "Angiotensin receptor blocker");
  assert.equal(isSameKnowledge(brand, klass), false);
});

test("an accent is part of the word, not formatting to be folded away", () => {
  // 🔴 For anyone learning a language the accent is frequently the thing being learned. A
  // normaliser that stripped diacritics would report mastery of a distinction never made.
  assert.equal(isSameKnowledge(association("resumé", "a summary"), association("resume", "a summary")), false);
});

test("composed and decomposed spellings of one accented word are one word", () => {
  const composed = association("café", "coffee house");
  const decomposed = association("café", "coffee house");
  assert.equal(isSameKnowledge(composed, decomposed), true);
});

// ── types that are not yet structural ───────────────────────────────────────

test("a non-association keys on its statement, and says so", () => {
  const a: KnowledgeObject = { id: "k1", statement: "Increasing resistance decreases current.", type: "causal" };
  const b: KnowledgeObject = { id: "k2", statement: "increasing resistance decreases current", type: "causal" };
  assert.equal(isSameKnowledge(a, b), true);
  assert.equal(identityIsStructural("causal"), false);
  assert.equal(identityIsStructural("association"), true);
});

test("the same words as two different KINDS of knowledge stay distinct", () => {
  const asCausal: KnowledgeObject = { id: "k1", statement: "Ohm's law", type: "causal" };
  const asAssociation: KnowledgeObject = { id: "k2", statement: "Ohm's law", type: "conceptual_system" };
  assert.equal(isSameKnowledge(asCausal, asAssociation), false);
});

// ── the basis is inspectable ────────────────────────────────────────────────

test("why two objects did or did not merge can be read rather than guessed", () => {
  assert.equal(identityBasis(association("Paris", "France")), "association|france|paris");
});

test("normalisation keeps punctuation inside the text, where it may be load-bearing", () => {
  assert.equal(normalizeForIdentity("  She said, run.  "), "she said, run");
});

test("a key is stable across runs, because everything downstream is stored against it", () => {
  assert.equal(knowledgeIdentityKey(association("France", "Paris")), knowledgeIdentityKey(association("France", "Paris")));
  assert.match(knowledgeIdentityKey(association("France", "Paris")), /^association:[0-9a-f]{16}$/);
});
