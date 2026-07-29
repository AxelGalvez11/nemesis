// Deno unit tests (repo convention) for Study's "::" path arithmetic. The case
// worth guarding is segment-aware prefix matching: a plain startsWith lets
// "Exam 1" swallow "Exam 10", which would silently rename or delete a folder the
// student never touched.
// Run from the REPO ROOT: deno test --no-check --allow-env apps/mobile/src/
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  allArtifactGroupPaths,
  buildArtifactTreeRows,
  decksInGroup,
  isWithinGroup,
  joinGroupPath,
  normalizeGroupPath,
  pathLeaf,
  pathParent,
  renamedGroupPath,
  rewriteGroupPrefix,
  safeLeafName,
} from "./study-tree.ts";

Deno.test("artifact rows build nested folders and keep root items visible", () => {
  const artifacts = [
    { groupName: "Pharm::Exam 1", id: "a" },
    { groupName: "Pharm::Exam 1", id: "b" },
    { groupName: "", id: "root" },
  ];
  assertEquals(allArtifactGroupPaths(artifacts), ["Pharm", "Pharm::Exam 1"]);
  const rows = buildArtifactTreeRows(artifacts, new Set(["Pharm::Exam 1"]));
  assertEquals(rows.map((row) => row.type === "folder" ? `${row.path}:${row.count}` : row.artifact.id), [
    "Pharm:2",
    "Pharm::Exam 1:2",
    "root",
  ]);
});

// The student never types "::" any more — the parent comes from a dropdown, so
// a separator that reaches a name field is always an accident. Folding it to a
// space keeps both words; stripping it would glue them together.
Deno.test("safeLeafName keeps a plain name and refuses to nest", () => {
  assertEquals(safeLeafName("Cardio"), "Cardio");
  assertEquals(safeLeafName("  Cardio  "), "Cardio");
  assertEquals(safeLeafName("Pharm::Cardio"), "Pharm Cardio");
  assertEquals(safeLeafName("Pharm :: Exam 1 :: Cardio"), "Pharm Exam 1 Cardio");
  assertEquals(safeLeafName("::Cardio"), "Cardio", "a leading separator is not an empty first word");
  assertEquals(safeLeafName("Cardio::"), "Cardio");
  assertEquals(safeLeafName("::"), "");
  assertEquals(safeLeafName("   "), "");
});

// The pairing that replaces the old "type Folder::Deck yourself" field: a leaf
// from the text box, a parent from the dropdown.
Deno.test("safeLeafName feeds joinGroupPath without re-introducing nesting", () => {
  assertEquals(joinGroupPath("Pharm", safeLeafName("Exam 1::Cardio")), "Pharm::Exam 1 Cardio");
  assertEquals(joinGroupPath("", safeLeafName("Cardio")), "Cardio");
});

Deno.test("normalizeGroupPath trims segments and drops empty ones", () => {
  assertEquals(normalizeGroupPath("Pharm :: Exam 1 :: Cardio"), "Pharm::Exam 1::Cardio");
  assertEquals(normalizeGroupPath("a:: ::b"), "a::b");
  assertEquals(normalizeGroupPath("  "), "");
});

Deno.test("pathLeaf and pathParent split a deck name", () => {
  assertEquals(pathLeaf("Pharm::Exam 1::Cardio"), "Cardio");
  assertEquals(pathParent("Pharm::Exam 1::Cardio"), "Pharm::Exam 1");
  assertEquals(pathLeaf("Cardio"), "Cardio");
  assertEquals(pathParent("Cardio"), "");
});

Deno.test("joinGroupPath puts a leaf under a group; empty group means root", () => {
  assertEquals(joinGroupPath("Pharm", "Cardio"), "Pharm::Cardio");
  assertEquals(joinGroupPath("", "Cardio"), "Cardio");
  assertEquals(joinGroupPath("Pharm", ""), "Pharm");
});

Deno.test("isWithinGroup is segment-aware — 'Exam 1' never swallows 'Exam 10'", () => {
  assertEquals(isWithinGroup("Exam 1::Cardio", "Exam 1"), true);
  assertEquals(isWithinGroup("Exam 1", "Exam 1"), true);
  assertEquals(isWithinGroup("Exam 10::Cardio", "Exam 1"), false);
  // An empty ancestor is the root, which contains everything.
  assertEquals(isWithinGroup("Anything", ""), true);
});

Deno.test("renamedGroupPath swaps the leaf and keeps the parent", () => {
  assertEquals(renamedGroupPath("Pharm::Exam 1", "Midterm"), "Pharm::Midterm");
  assertEquals(renamedGroupPath("Exam 1", "Midterm"), "Midterm");
});

Deno.test("rewriteGroupPrefix reparents a deck and leaves out-of-scope names alone", () => {
  assertEquals(rewriteGroupPrefix("Pharm::Exam 1::Cardio", "Pharm::Exam 1", "Pharm::Midterm"), "Pharm::Midterm::Cardio");
  // The folder row itself.
  assertEquals(rewriteGroupPrefix("Pharm::Exam 1", "Pharm::Exam 1", "Pharm::Midterm"), "Pharm::Midterm");
  // Out of scope -> null, so the caller skips the write entirely.
  assertEquals(rewriteGroupPrefix("Pharm::Exam 10::Cardio", "Pharm::Exam 1", "Pharm::Midterm"), null);
  assertEquals(rewriteGroupPrefix("Other::Cardio", "Pharm", "Chem"), null);
});

Deno.test("rewriteGroupPrefix returns null when nothing would change", () => {
  assertEquals(rewriteGroupPrefix("Pharm::Cardio", "Pharm", "Pharm"), null);
});

Deno.test("rewriteGroupPrefix can move a folder to the root", () => {
  assertEquals(rewriteGroupPrefix("Pharm::Exam 1::Cardio", "Pharm::Exam 1", ""), "Cardio");
});

Deno.test("decksInGroup collects the whole subtree, nothing adjacent", () => {
  const decks = [
    { name: "Pharm::Exam 1::Cardio" },
    { name: "Pharm::Exam 1" },
    { name: "Pharm::Exam 10::Renal" },
    { name: "Chem::Organic" },
  ];
  assertEquals(decksInGroup(decks, "Pharm::Exam 1").map((d) => d.name), ["Pharm::Exam 1::Cardio", "Pharm::Exam 1"]);
  // An empty group is not a licence to select everything for a destructive op.
  assertEquals(decksInGroup(decks, ""), []);
});
