import assert from "node:assert/strict";
import { test } from "node:test";

import {
  KNOWLEDGE_IDENTITY_VERSION,
  identityBasis,
  relationKindFromHeader,
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

test("a type with no payload of its own still keys on its statement", () => {
  // 🔴 A CAUSAL OBJECT CARRYING NO RELATION IS THE DEGENERATE CASE, not the normal one. The
  // extractor always mints a relation; this path exists so an object holding only a sentence still
  // gets a stable key rather than none.
  const a: KnowledgeObject = { id: "k1", statement: "Increasing resistance decreases current.", type: "causal" };
  const b: KnowledgeObject = { id: "k2", statement: "increasing resistance decreases current", type: "causal" };
  assert.equal(isSameKnowledge(a, b), true);

  const c: KnowledgeObject = { id: "k3", statement: "Ohm's law in words", type: "conceptual_system" };
  const d: KnowledgeObject = { id: "k4", statement: "ohm's law in words", type: "conceptual_system" };
  assert.equal(isSameKnowledge(c, d), true);
  assert.equal(identityIsStructural("conceptual_system"), false);
});

test("association and causal both have structural identity; the rest do not", () => {
  assert.equal(identityIsStructural("association"), true);
  // 🔴 CHANGED WHEN CAUSAL GAINED A PAYLOAD. It used to be statement-keyed, so two lectures wording
  // one mechanism differently could never converge. With a relation it keys on cause, effect,
  // direction, negation and modality — see knowledge-persistence.test.ts.
  assert.equal(identityIsStructural("causal"), true);
  assert.equal(identityIsStructural("procedure"), false);
});

test("the same words as two different KINDS of knowledge stay distinct", () => {
  const asCausal: KnowledgeObject = { id: "k1", statement: "Ohm's law", type: "causal" };
  const asAssociation: KnowledgeObject = { id: "k2", statement: "Ohm's law", type: "conceptual_system" };
  assert.equal(isSameKnowledge(asCausal, asAssociation), false);
});

// ── the basis is inspectable ────────────────────────────────────────────────

test("why two objects did or did not merge can be read rather than guessed", () => {
  assert.equal(identityBasis(association("Paris", "France")), "association|unstated|france|paris");
});

// ── the relationship the two halves stand in ────────────────────────────────

test("🔴 identical strings in DIFFERENT relationships are different knowledge", () => {
  // A glossary's "X — its definition" and a parts list's "X — its supplier" share both strings
  // and are not the same thing to know. Without the relation in the key they would collapse, and
  // a learner would be credited with knowing something they were never asked.
  const defined = association("Widget", "Acme", { relationKind: "definition|term" });
  const supplied = association("Widget", "Acme", { relationKind: "part|supplier" });
  assert.equal(isSameKnowledge(defined, supplied), false);
});

test("two sources that agree on the relationship still converge", () => {
  const lecture = association("losartan", "Cozaar", { id: "a", relationKind: "brand|generic" });
  const revision = association("Cozaar", "losartan", { id: "b", relationKind: "brand|generic" });
  assert.equal(isSameKnowledge(lecture, revision), true);
});

test("a grid that named no columns does not silently match one that did", () => {
  // 🔴 "unstated" is NOT a wildcard. Matching it against a stated relationship would be a guess
  // about what the headerless table's columns meant, and a false merge is the failure this file
  // exists to prevent. Two such tables not converging is a missed merge, which is recoverable.
  const stated = association("losartan", "Cozaar", { relationKind: "brand|generic" });
  const unstated = association("losartan", "Cozaar");
  assert.equal(isSameKnowledge(stated, unstated), false);
});

test("the relation kind is the source's own words, normalised and order-independent", () => {
  assert.equal(relationKindFromHeader(["Generic", "Brand"]), "brand|generic");
  assert.equal(relationKindFromHeader(["Brand", "Generic"]), "brand|generic");
  assert.equal(relationKindFromHeader(["Term", "Definition"]), "definition|term");
});

test("a grid with no usable header states no relationship rather than inventing one", () => {
  assert.equal(relationKindFromHeader(undefined), null);
  assert.equal(relationKindFromHeader(["Only one"]), null);
  assert.equal(relationKindFromHeader(["", "  "]), null);
});

test("the relation kind is DERIVED, never understood — it carries no meaning of its own", () => {
  // 🔴 The field-agnostic rule. Nothing knows that a "brand" is a trade name; these are just the
  // words the document used. A law source and an engineering source produce their own, and both
  // work, precisely because no mapping from word to meaning exists anywhere.
  assert.equal(relationKindFromHeader(["Case", "Holding"]), "case|holding");
  // Trailing punctuation is formatting: "Part No." and "Part No" name the same column.
  assert.equal(relationKindFromHeader(["Part", "Part No."]), "part|part no");
  assert.equal(relationKindFromHeader(["Kanji", "Reading"]), "kanji|reading");
});

test("normalisation keeps punctuation inside the text, where it may be load-bearing", () => {
  assert.equal(normalizeForIdentity("  She said, run.  "), "she said, run");
});

test("a key is stable across runs, because everything downstream is stored against it", () => {
  assert.equal(knowledgeIdentityKey(association("France", "Paris")), knowledgeIdentityKey(association("France", "Paris")));
  assert.match(knowledgeIdentityKey(association("France", "Paris")), /^association:v\d+:[0-9a-f]{16}$/);
});

test("🔴 the key says which rules made it", () => {
  // Evidence is stored against this string. A key computed under old rules and one computed under
  // new rules are otherwise both just sixteen hex characters, so changing the algorithm after
  // evidence exists would be a migration with no way to find its own rows. Drop the version from
  // `knowledgeIdentityKey` and this goes red.
  const key = knowledgeIdentityKey(association("losartan", "Cozaar"));
  assert.equal(key.split(":").length, 3, "expected type:version:hash");
  assert.equal(key.split(":")[1], `v${KNOWLEDGE_IDENTITY_VERSION}`);
});
