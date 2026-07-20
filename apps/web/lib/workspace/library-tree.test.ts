// Unit test for the Library folder-tree builder. No runner is wired into the web build, so run
// ad hoc (same convention as lib/cite.test.ts):
//   npx tsx lib/workspace/library-tree.test.ts
// Exercises the pure path-splitting logic the Library sidebar depends on: nesting, sibling
// sort order, the blank-title → filename fallback, and skipping a malformed (empty-path) row.
import assert from "node:assert/strict";
import { buildLibraryTree, countLibraryNotes, titleFromPath } from "./library-tree";

// titleFromPath strips a known note extension off the last path segment.
assert.equal(titleFromPath("A/B/My File.md"), "My File");
assert.equal(titleFromPath("Loose note.md"), "Loose note");
assert.equal(titleFromPath("no-extension"), "no-extension");

const notes = [
  { id: "beta", path: "Pharmacology/Unit 3/Beta Blockers.md", title: "" },
  { id: "alpha", path: "Pharmacology/Unit 3/Alpha Agonists.md", title: "Alpha Agonists" },
  { id: "intro", path: "Pharmacology/Unit 1/Intro.md", title: "Intro" },
  { id: "loose", path: "Loose note.md", title: "Loose note" },
  { id: "bad", path: "", title: "malformed row — no path, must be skipped" },
];

const tree = buildLibraryTree(notes, ["Empty course/Week 1"]);

// Root-level note sits directly on the root's notes array.
assert.equal(tree.notes.length, 1);
assert.equal(tree.notes[0]?.title, "Loose note");

// The persisted empty folder and the populated folder are both preserved.
assert.equal(tree.folders.length, 2);
assert.equal(tree.folders[0]?.path, "Empty course");
const pharm = tree.folders[1];
assert.equal(pharm?.name, "Pharmacology");
assert.equal(pharm?.path, "Pharmacology");
assert.equal(pharm?.folders.length, 2);

// Sibling folders sort alphabetically ("Unit 1" before "Unit 3").
assert.equal(pharm?.folders[0]?.name, "Unit 1");
assert.equal(pharm?.folders[1]?.name, "Unit 3");

// Notes within a folder sort alphabetically by (resolved) title.
const unit3 = pharm?.folders[1];
assert.equal(unit3?.notes.length, 2);
assert.equal(unit3?.notes[0]?.title, "Alpha Agonists");
// Blank `title` falls back to the filename derived from `path`.
assert.equal(unit3?.notes[1]?.title, "Beta Blockers");
assert.equal(unit3?.notes[1]?.path, "Pharmacology/Unit 3/Beta Blockers.md");

// The empty-path row never made it into the tree — 4 valid notes in, 4 counted.
assert.equal(countLibraryNotes(tree), 4);

const sortable = [
  { id: "a", path: "A.md", title: "Alpha", updatedAt: "2026-07-18T12:00:00.000Z", createdAt: "2026-07-20T12:00:00.000Z" },
  { id: "z", path: "Z.md", title: "Zulu", updatedAt: "2026-07-20T12:00:00.000Z", createdAt: "2026-07-18T12:00:00.000Z" },
];
assert.deepEqual(buildLibraryTree(sortable, [], "za").notes.map((note) => note.title), ["Zulu", "Alpha"]);
assert.deepEqual(buildLibraryTree(sortable, [], "modified").notes.map((note) => note.title), ["Zulu", "Alpha"]);
assert.deepEqual(buildLibraryTree(sortable, [], "added").notes.map((note) => note.title), ["Alpha", "Zulu"]);

console.log("library-tree.test.ts OK");
