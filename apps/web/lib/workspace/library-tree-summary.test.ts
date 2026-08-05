import assert from "node:assert/strict";
import test from "node:test";

import {
  expandLibraryFolder,
  FOLDER_EXPAND_NOTE_CAP,
  summarizeLibraryTree,
  type LibraryTreeDoc,
} from "./library-tree-summary";

const note = (path: string): LibraryTreeDoc => ({ kind: "note", path, title: path.split("/").pop() ?? path });
const folder = (path: string): LibraryTreeDoc => ({ kind: "folder", path, title: path.split("/").pop() ?? path });

const DOCS: LibraryTreeDoc[] = [
  note("Home.md"),
  note("Pharmacology/Pharmacology.md"),
  note("Pharmacology/Cardiovascular/Hypertension.md"),
  note("Pharmacology/Cardiovascular/Heart failure.md"),
  note("Pharmacology/Exam 2.md"),
  folder("Pharmacology/Sources"),
  note("Inbox/notes-final-v2.md"),
];

test("every folder appears with real counts — explicit rows and implied ancestors alike", () => {
  const summary = summarizeLibraryTree(DOCS);
  assert.equal(summary.total_notes, 6);
  assert.equal(summary.root_notes, 1); // Home.md
  assert.deepEqual(summary.folders, [
    { notes: 1, path: "Inbox", total_notes: 1 },
    { notes: 2, path: "Pharmacology", total_notes: 4 },
    { notes: 2, path: "Pharmacology/Cardiovascular", total_notes: 2 },
    // An explicit but empty folder still exists — the agent must SEE it to
    // clean it up.
    { notes: 0, path: "Pharmacology/Sources", total_notes: 0 },
  ]);
  assert.equal(summary.complete, true);
});

test("expanding a folder lists its own notes and its subfolders with counts", () => {
  const listing = expandLibraryFolder(DOCS, "Pharmacology");
  assert.deepEqual(listing.subfolders.map((sub) => sub.path), ["Pharmacology/Cardiovascular", "Pharmacology/Sources"]);
  assert.deepEqual(listing.notes.map((doc) => doc.path), ["Pharmacology/Exam 2.md", "Pharmacology/Pharmacology.md"]);
  assert.equal(listing.note_count, 2);
  assert.equal(listing.complete, true);
});

test("the root expands like any folder — 'clean up my Library' starts here, no search term", () => {
  const listing = expandLibraryFolder(DOCS, "");
  assert.deepEqual(listing.notes.map((doc) => doc.path), ["Home.md"]);
  assert.deepEqual(listing.subfolders.map((sub) => sub.path), ["Inbox", "Pharmacology"]);
});

test("🔴 clipping is never silent: the real count and a way forward ride the payload", () => {
  const many: LibraryTreeDoc[] = Array.from({ length: FOLDER_EXPAND_NOTE_CAP + 5 }, (_, index) =>
    note(`Big/Note ${String(index).padStart(3, "0")}.md`));
  const listing = expandLibraryFolder(many, "Big");
  assert.equal(listing.complete, false);
  assert.equal(listing.note_count, FOLDER_EXPAND_NOTE_CAP + 5);
  assert.equal(listing.notes.length, FOLDER_EXPAND_NOTE_CAP);
  assert.match(listing.clipped_note ?? "", /205 notes/);
});

// ── Root notes must be reachable, not just countable ────────────────────────
// Owner 2026-08-05, acceptance test 6: the summary said `root_notes: 3` and
// offered no way to see them, so the agent guessed search terms until it ran
// out of tool rounds and leaked markup instead of cleaning anything.

test("the tree names the notes sitting loose at the root", () => {
  const docs: LibraryTreeDoc[] = [
    { kind: "note", path: "Loose one.md", title: "Loose one" },
    { kind: "note", path: "Loose two.md", title: "Loose two" },
    { kind: "note", path: "Pharmacy/Immunology.md", title: "Immunology" },
  ];
  const summary = summarizeLibraryTree(docs);
  assert.equal(summary.root_notes, 2);
  assert.deepEqual(summary.root_note_list.map((note) => note.title), ["Loose one", "Loose two"]);
  assert.equal(summary.root_note_list.length, summary.root_notes, "a count you cannot resolve is worse than no count");
});

test("expanding the root explicitly lists the same notes and no folder's notes", () => {
  const docs: LibraryTreeDoc[] = [
    { kind: "note", path: "Loose one.md", title: "Loose one" },
    { kind: "note", path: "Pharmacy/Immunology.md", title: "Immunology" },
  ];
  const listing = expandLibraryFolder(docs, "");
  assert.equal(listing.folder, "");
  assert.deepEqual(listing.notes.map((note) => note.title), ["Loose one"]);
  assert.deepEqual(listing.subfolders.map((folder) => folder.path), ["Pharmacy"]);
  assert.equal(listing.complete, true);
});
