import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decksInGroup,
  isWithinGroup,
  joinGroupPath,
  normalizeGroupPath,
  pathLeaf,
  pathParent,
  renamedGroupPath,
  rewriteGroupPrefix,
} from "./study-tree";

test("normalize trims segments and drops empty ones", () => {
  assert.equal(normalizeGroupPath("  Pharm :: Exam 1 "), "Pharm::Exam 1");
  assert.equal(normalizeGroupPath("Pharm::::Exam 1"), "Pharm::Exam 1");
  assert.equal(normalizeGroupPath("   "), "");
  assert.equal(normalizeGroupPath("::"), "");
});

test("leaf and parent split a path at its last separator", () => {
  assert.equal(pathLeaf("Pharm::Exam 1::Cardio"), "Cardio");
  assert.equal(pathLeaf("Cardio"), "Cardio");
  assert.equal(pathParent("Pharm::Exam 1::Cardio"), "Pharm::Exam 1");
  // A root-level item has no parent folder, not a folder named "".
  assert.equal(pathParent("Cardio"), "");
});

test("join puts an item back under a folder, or leaves it at the root", () => {
  assert.equal(joinGroupPath("Pharm::Exam 1", "Cardio"), "Pharm::Exam 1::Cardio");
  assert.equal(joinGroupPath("", "Cardio"), "Cardio");
  assert.equal(joinGroupPath(" Pharm ", " Cardio "), "Pharm::Cardio");
});

test("containment is segment-aware so sibling folders with a shared prefix never match", () => {
  assert.equal(isWithinGroup("Pharm::Exam 1::Cardio", "Pharm::Exam 1"), true);
  assert.equal(isWithinGroup("Pharm::Exam 1", "Pharm::Exam 1"), true);
  // "Exam 1" must NOT swallow "Exam 10" — a raw startsWith would say true here
  // and silently rename or delete a folder the student never touched.
  assert.equal(isWithinGroup("Pharm::Exam 10::Cardio", "Pharm::Exam 1"), false);
  assert.equal(isWithinGroup("Pharm::Exam 1::Cardio", "Pharm::Exam 2"), false);
  // Everything sits within the root.
  assert.equal(isWithinGroup("Pharm::Exam 1", ""), true);
});

test("renaming a folder swaps only its last segment", () => {
  assert.equal(renamedGroupPath("Pharm::Exam 1", "Exam 2"), "Pharm::Exam 2");
  assert.equal(renamedGroupPath("Pharm", "Pharmacology"), "Pharmacology");
  // A "::" typed into the rename box would forge a nested folder — flatten it.
  assert.equal(renamedGroupPath("Pharm::Exam 1", "Exam::2"), "Pharm::Exam::2");
});

test("rewriting a prefix moves a deck with its folder and leaves outsiders alone", () => {
  assert.equal(rewriteGroupPrefix("Pharm::Exam 1::Cardio", "Pharm::Exam 1", "Pharm::Exam 2"), "Pharm::Exam 2::Cardio");
  // The folder row itself (name === source) rewrites to the destination.
  assert.equal(rewriteGroupPrefix("Pharm::Exam 1", "Pharm::Exam 1", "Pharm::Exam 2"), "Pharm::Exam 2");
  // Out of scope → null, so callers can skip the write entirely.
  assert.equal(rewriteGroupPrefix("Pharm::Exam 10::Cardio", "Pharm::Exam 1", "Pharm::Exam 2"), null);
  assert.equal(rewriteGroupPrefix("Micro::Unit 1", "Pharm", "Pharmacology"), null);
  // Promoting a folder to the root drops the prefix but keeps the leaf.
  assert.equal(rewriteGroupPrefix("Pharm::Cardio", "Pharm", ""), "Cardio");
});

test("decksInGroup collects every deck beneath a folder, nested included", () => {
  const decks = [
    { id: "a", name: "Pharm::Exam 1::Cardio" },
    { id: "b", name: "Pharm::Exam 1::Renal::Diuretics" },
    { id: "c", name: "Pharm::Exam 10::Cardio" },
    { id: "d", name: "Micro::Unit 1" },
  ];
  assert.deepEqual(decksInGroup(decks, "Pharm::Exam 1").map((deck) => deck.id), ["a", "b"]);
  assert.deepEqual(decksInGroup(decks, "Pharm").map((deck) => deck.id), ["a", "b", "c"]);
  assert.deepEqual(decksInGroup(decks, "Nope").map((deck) => deck.id), []);
});
