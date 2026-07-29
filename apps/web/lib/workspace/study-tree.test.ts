import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildArtifactTree,
  folderDropAccepts,
  movedFolderPath,
  decksInGroup,
  isWithinGroup,
  UNGROUPED_LABEL,
  joinGroupPath,
  normalizeGroupPath,
  pathLeaf,
  pathParent,
  planGroupDissolve,
  renamedGroupPath,
  rewriteGroupPrefix,
  uniqueDeckName,
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

test("uniqueDeckName only suffixes when the name is already taken", () => {
  assert.equal(uniqueDeckName("Cardio", new Set()), "Cardio");
  assert.equal(uniqueDeckName("Cardio", new Set(["cardio"])), "Cardio 2");
  assert.equal(uniqueDeckName("Cardio", new Set(["cardio", "cardio 2"])), "Cardio 3");
  // `taken` is lower-cased BY THE CALLER — planGroupDissolve builds it that way.
  // A differently-cased deck name still collides, which is what matters.
  assert.equal(uniqueDeckName("CARDIO", new Set(["cardio"])), "CARDIO 2");
});

test("dissolving a folder promotes its contents instead of deleting them", () => {
  const decks = [
    { id: "a", name: "Pharm::Exam 1::Cardio" },
    { id: "b", name: "Pharm::Exam 1::Renal::Diuretics" },
    { id: "c", name: "Pharm::Exam 10::Cardio" },
    { id: "d", name: "Micro::Unit 1" },
  ];
  const plan = planGroupDissolve(decks, "Pharm::Exam 1");
  assert.deepEqual(plan.map((entry) => [entry.deck.id, entry.name]), [
    ["a", "Pharm::Cardio"],
    // A sub-folder inside the dissolved one survives; only ONE level is removed.
    ["b", "Pharm::Renal::Diuretics"],
  ]);
  // Exam 10 is a sibling, not a child — it must be untouched.
  assert.equal(plan.some((entry) => entry.deck.id === "c"), false);
});

test("dissolving a root folder moves its decks to the top level", () => {
  const decks = [{ id: "a", name: "Pharm::Cardio" }, { id: "b", name: "Micro::Unit 1" }];
  assert.deepEqual(planGroupDissolve(decks, "Pharm").map((entry) => entry.name), ["Cardio"]);
});

test("dissolve renames around a collision rather than refusing or clobbering", () => {
  // Promoting "Pharm::Exam 1::Cardio" would land on the existing "Pharm::Cardio".
  // Refusing would wedge the student on a delete they asked to be safe, and
  // overwriting would lose a deck — so the promoted one takes the next name.
  const decks = [
    { id: "a", name: "Pharm::Exam 1::Cardio" },
    { id: "b", name: "Pharm::Cardio" },
  ];
  assert.deepEqual(planGroupDissolve(decks, "Pharm::Exam 1"), [{ deck: decks[0], name: "Pharm::Cardio 2" }]);
});

test("a deck named exactly like the folder keeps its name instead of becoming empty", () => {
  // "Pharm" the deck and "Pharm" the folder can coexist; promoting the deck
  // would rewrite it to "", which is not a name.
  const decks = [{ id: "a", name: "Pharm" }, { id: "b", name: "Pharm::Cardio" }];
  assert.deepEqual(planGroupDissolve(decks, "Pharm"), [{ deck: decks[1], name: "Cardio" }]);
});

test("dissolve is a no-op for the root and for folders that hold nothing", () => {
  const decks = [{ id: "a", name: "Pharm::Cardio" }];
  assert.deepEqual(planGroupDissolve(decks, ""), []);
  assert.deepEqual(planGroupDissolve(decks, "Nope"), []);
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

// The flat-folder rules that used to live here (artifactDropAccepts: a folder
// cannot be dropped on itself; "Ungrouped" can be a target but never a payload)
// went with the flat list on 2026-07-29. Folders nest now, so folderDropAccepts
// below is the whole rule, and "Ungrouped" is not a row at all — loose items sit
// at the top level.

// ── Tests/Mindmaps folders, nested like Cards (owner 2026-07-28) ─────────────

const artifact = (id: string, title: string, groupName: string) => ({ groupName, id, title });

test("artifacts nest under their :: folders", () => {
  const tree = buildArtifactTree([
    artifact("a", "Loose test", ""),
    artifact("b", "Cardio quiz", "Pharm::Exam 1"),
    artifact("c", "Renal quiz", "Pharm::Exam 2"),
    artifact("d", "Whole-course", "Pharm"),
  ]);
  assert.deepEqual(tree.map((n) => n.label), ["Pharm", "Loose test"], "folders before items");
  const pharm = tree[0]!;
  assert.deepEqual(pharm.children.map((n) => n.label), ["Exam 1", "Exam 2", "Whole-course"]);
  assert.equal(pharm.children[0]!.path, "Pharm::Exam 1");
  assert.equal(pharm.children[0]!.children[0]!.item?.title, "Cardio quiz");
});

// Without this an empty folder disappears the moment its last test moves out.
test("a folder holding nothing still appears", () => {
  const tree = buildArtifactTree([], ["Pharm::Exam 3"]);
  assert.equal(tree[0]?.label, "Pharm");
  assert.equal(tree[0]?.children[0]?.path, "Pharm::Exam 3");
});

test("a folder cannot be dropped into itself, its own child, or where it already is", () => {
  assert.equal(folderDropAccepts("Pharm", "Pharm"), false, "onto itself");
  assert.equal(folderDropAccepts("Pharm", "Pharm::Exam 1"), false, "into its own descendant");
  assert.equal(folderDropAccepts("Pharm::Exam 1", "Pharm"), false, "already there");
  assert.equal(folderDropAccepts("", "Pharm"), false, "the root is not a folder");
});

test("a folder can move to another branch or out to the root", () => {
  assert.equal(folderDropAccepts("Pharm::Exam 1", "Renal"), true);
  assert.equal(movedFolderPath("Pharm::Exam 1", "Renal"), "Renal::Exam 1");
  assert.equal(folderDropAccepts("Pharm::Exam 1", ""), true, "out to the root");
  assert.equal(movedFolderPath("Pharm::Exam 1", ""), "Exam 1");
});

// The segment-aware check that keeps "Exam 1" from reading as an ancestor of
// "Exam 10" — a raw startsWith would refuse this legitimate move.
test("a sibling with a longer name is not an ancestor", () => {
  assert.equal(folderDropAccepts("Exam 1", "Exam 10"), true);
  assert.equal(movedFolderPath("Exam 1", "Exam 10"), "Exam 10::Exam 1");
});
