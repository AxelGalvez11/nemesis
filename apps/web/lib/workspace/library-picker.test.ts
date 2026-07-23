import assert from "node:assert/strict";
import test from "node:test";

import { buildLibraryTree } from "./library-tree";
import {
  attachmentFileName,
  collectNoteIds,
  flattenPickerRows,
  folderCheckState,
  folderKey,
  orderedSelection,
  searchPickerRows,
  toggleFolderSelection,
} from "./library-picker";

const NOTES = [
  { id: "n-ace", path: "Pharmacology/Cardio/ACE inhibitors.md", title: "ACE inhibitors" },
  { id: "n-beta", path: "Pharmacology/Cardio/Beta blockers.md", title: "Beta blockers" },
  { id: "n-syllabus", path: "Pharmacology/Syllabus.md", title: "Syllabus" },
  { id: "n-loose", path: "Reading list.md", title: "Reading list" },
];

function tree(folders: readonly string[] = []) {
  return buildLibraryTree(NOTES, folders);
}

test("collectNoteIds reaches notes nested any number of folders deep", () => {
  const pharmacology = tree().folders.find((folder) => folder.name === "Pharmacology")!;
  assert.deepEqual(collectNoteIds(pharmacology).sort(), ["n-ace", "n-beta", "n-syllabus"]);
});

test("collapsed folders contribute a row but hide their notes", () => {
  const rows = flattenPickerRows(tree(), new Set());
  assert.deepEqual(
    rows.map((row) => `${row.kind}:${row.kind === "folder" ? row.path : row.title}`),
    ["folder:Pharmacology", "note:Reading list"],
  );
});

test("expanding a folder reveals its children one depth further in", () => {
  const rows = flattenPickerRows(tree(), new Set([folderKey("Pharmacology")]));
  assert.deepEqual(
    rows.map((row) => [row.kind, row.depth]),
    [["folder", 0], ["folder", 1], ["note", 1], ["note", 0]],
  );
  // Cardio is collapsed, so its two notes are still hidden.
  assert.equal(rows.filter((row) => row.kind === "note").length, 2);
});

test("a folder row carries every note beneath it, not just its direct children", () => {
  const rows = flattenPickerRows(tree(), new Set());
  const pharmacology = rows.find((row) => row.kind === "folder")!;
  assert.equal(pharmacology.kind === "folder" && pharmacology.noteIds.length, 3);
});

test("search flattens the tree and matches title OR path", () => {
  const byTitle = searchPickerRows(tree(), "beta");
  assert.deepEqual(byTitle.map((row) => row.id), ["n-beta"]);

  // "Cardio" appears in no title — only in the folder segment of the path.
  const byPath = searchPickerRows(tree(), "cardio");
  assert.deepEqual(byPath.map((row) => row.id).sort(), ["n-ace", "n-beta"]);

  assert.deepEqual(searchPickerRows(tree(), "   "), []);
});

test("folderCheckState reports none / some / all", () => {
  const ids = ["a", "b", "c"];
  assert.equal(folderCheckState(ids, new Set()), "none");
  assert.equal(folderCheckState(ids, new Set(["b"])), "some");
  assert.equal(folderCheckState(ids, new Set(ids)), "all");
});

test("an EMPTY folder is never 'all' — a ticked box that attaches nothing is a lie", () => {
  assert.equal(folderCheckState([], new Set()), "none");
  assert.equal(folderCheckState([], new Set(["a"])), "none");
});

test("toggling a partial folder fills it up; toggling a full one clears it", () => {
  const ids = ["a", "b"];
  const filled = toggleFolderSelection(new Set(["a"]), ids);
  assert.deepEqual([...filled].sort(), ["a", "b"]);
  assert.deepEqual([...toggleFolderSelection(filled, ids)], []);
});

test("toggling a folder leaves selections OUTSIDE it alone", () => {
  const next = toggleFolderSelection(new Set(["outside", "a"]), ["a", "b"]);
  assert.equal(next.has("outside"), true);
});

test("toggleFolderSelection does not mutate the set it was given", () => {
  const before = new Set(["a"]);
  toggleFolderSelection(before, ["a", "b"]);
  assert.deepEqual([...before], ["a"]);
});

test("attachmentFileName strips what would read as a path, and never returns bare .md", () => {
  assert.equal(attachmentFileName("Week 3/Notes"), "Week 3-Notes.md");
  assert.equal(attachmentFileName("Ratio: 2:1"), "Ratio- 2-1.md");
  assert.equal(attachmentFileName("   "), "Note.md");
});

test("orderedSelection returns tree order, not click order", () => {
  const clicked = new Set(["n-loose", "n-ace"]);
  assert.deepEqual(orderedSelection(tree(), clicked), ["n-ace", "n-loose"]);
});

test("an empty folder row still renders (so it can be seen), with no notes to tick", () => {
  const rows = flattenPickerRows(tree(["Empty course"]), new Set());
  const empty = rows.find((row) => row.kind === "folder" && row.path === "Empty course");
  assert.ok(empty);
  assert.equal(empty.kind === "folder" && empty.noteIds.length, 0);
});
