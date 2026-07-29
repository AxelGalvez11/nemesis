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

// --- "My order": the hand-arranged order the phone writes ---------------------
// These assertions mirror compareManual in apps/mobile/src/lib/library-order.ts.
// The two apps read the SAME `position` column, so if this block and the phone's
// own library-order.test.ts ever disagree, the same library renders in two
// different orders and the bug is invisible to either app's tests alone.

// A lower position comes first, regardless of title.
const arranged = [
  { id: "z", path: "Z.md", title: "Zulu", position: 0 },
  { id: "a", path: "A.md", title: "Alpha", position: 1 },
];
assert.deepEqual(buildLibraryTree(arranged, [], "manual").notes.map((note) => note.title), ["Zulu", "Alpha"]);

// NULL SORTS LAST — the rule that matters most. Notes made on the web, in chat
// or by the recorder never carry a position, so most of a real library is null;
// sorting them first would bury the student's arrangement underneath every note
// they have ever created. Untouched notes fall to the bottom in title order.
const mixed = [
  { id: "n2", path: "N2.md", title: "Never dragged B" },
  { id: "n1", path: "N1.md", title: "Never dragged A", position: null },
  { id: "d", path: "D.md", title: "Dragged", position: 5 },
];
assert.deepEqual(
  buildLibraryTree(mixed, [], "manual").notes.map((note) => note.title),
  ["Dragged", "Never dragged A", "Never dragged B"],
);

// Equal positions fall back to title, so the order can never wobble between loads.
const tied = [
  { id: "b", path: "B.md", title: "Bravo", position: 2 },
  { id: "a", path: "A.md", title: "Alpha", position: 2 },
];
assert.deepEqual(buildLibraryTree(tied, [], "manual").notes.map((note) => note.title), ["Alpha", "Bravo"]);

// POSITIONS ARE PER-FOLDER. Two notes in different folders may hold the same
// number and it means nothing — each folder is sorted on its own, so position 0
// leads inside BOTH folders rather than one folder's 0 outranking the other's.
const perFolder = [
  { id: "u1b", path: "Unit 1/Beta.md", title: "Beta", position: 0 },
  { id: "u1a", path: "Unit 1/Alpha.md", title: "Alpha", position: 1 },
  { id: "u2b", path: "Unit 2/Delta.md", title: "Delta", position: 0 },
  { id: "u2a", path: "Unit 2/Charlie.md", title: "Charlie", position: 1 },
];
const byFolder = buildLibraryTree(perFolder, [], "manual");
assert.deepEqual(byFolder.folders[0]?.notes.map((note) => note.title), ["Beta", "Alpha"]);
assert.deepEqual(byFolder.folders[1]?.notes.map((note) => note.title), ["Delta", "Charlie"]);

// Fractional midpoints are what a real drag writes (positionBetween halves the
// gap), so ordering must hold for non-integers, negatives and zero alike.
const fractional = [
  { id: "c", path: "C.md", title: "Third", position: 0.5 },
  { id: "a", path: "A.md", title: "First", position: -1 },
  { id: "b", path: "B.md", title: "Second", position: 0 },
];
assert.deepEqual(
  buildLibraryTree(fractional, [], "manual").notes.map((note) => note.title),
  ["First", "Second", "Third"],
);

console.log("library-tree.test.ts OK");
