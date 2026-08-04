import assert from "node:assert/strict";
import test from "node:test";

import { folderIndex, folderIndexFor } from "./library-folder-index";
import type { CloudLibraryNote } from "./library-tree";

function note(path: string, extra: Partial<CloudLibraryNote> = {}): CloudLibraryNote {
  const title = (path.split("/").pop() ?? path).replace(/\.md$/i, "");
  return {
    id: `id:${path}`,
    path,
    title,
    content: "",
    updatedAt: "2026-08-04T00:00:00Z",
    createdAt: "2026-08-01T00:00:00Z",
    ...extra,
  };
}

const LIBRARY: CloudLibraryNote[] = [
  note("Home.md"),
  note("Scratch ideas.md"),
  note("Contract Law/Contract Law.md"),
  note("Contract Law/Offer and acceptance.md"),
  note("Contract Law/Unit 3/Unit 3.md"),
  note("Contract Law/Unit 3/Consideration.md"),
  note("Mechanics/Beam bending.md"),
];

test("the home index lists top-level notes and folders, not Home itself", () => {
  const index = folderIndex(LIBRARY, "", "id:Home.md");
  assert.deepEqual(index.folders.map((f) => f.path), ["Contract Law", "Mechanics"]);
  assert.deepEqual(index.notes.map((n) => n.path), ["Scratch ideas.md"]);
});

test("a folder index lists direct children only, folders first-class", () => {
  const index = folderIndex(LIBRARY, "Contract Law", "id:Contract Law/Contract Law.md");
  assert.deepEqual(index.folders.map((f) => f.path), ["Contract Law/Unit 3"]);
  assert.deepEqual(index.notes.map((n) => n.path), ["Contract Law/Offer and acceptance.md"]);
});

test("folder matching is case-insensitive and each subfolder appears once", () => {
  const messy = [
    note("contract law/Extra note.md"),
    note("Contract Law/Unit 3/Consideration.md"),
    note("Contract Law/Unit 3/Estoppel.md"),
  ];
  const index = folderIndex(messy, "Contract Law");
  assert.deepEqual(index.notes.map((n) => n.path), ["contract law/Extra note.md"]);
  assert.equal(index.folders.length, 1);
  assert.equal(index.folders[0]!.path, "Contract Law/Unit 3");
});

test("hand-arranged positions order the notes like the sidebar tree", () => {
  const arranged = [
    note("Zeta.md", { position: 0 }),
    note("Alpha.md"),
    note("Middle.md", { position: 1 }),
  ];
  const index = folderIndex(arranged, "");
  assert.deepEqual(index.notes.map((n) => n.path), ["Zeta.md", "Middle.md", "Alpha.md"]);
});

test("folderIndexFor: containers get an index, ordinary notes get null", () => {
  const home = LIBRARY[0]!;
  const folderPage = LIBRARY[4]!; // Contract Law/Unit 3/Unit 3.md
  const ordinary = LIBRARY[6]!; // Mechanics/Beam bending.md
  assert.ok(folderIndexFor(home, LIBRARY));
  const unit3 = folderIndexFor(folderPage, LIBRARY);
  assert.deepEqual(unit3?.notes.map((n) => n.path), ["Contract Law/Unit 3/Consideration.md"]);
  assert.deepEqual(unit3?.folders, []);
  assert.equal(folderIndexFor(ordinary, LIBRARY), null);
});

test("a folder holding only its own page indexes as empty", () => {
  const lone = [note("Empty/Empty.md")];
  const index = folderIndex(lone, "Empty", "id:Empty/Empty.md");
  assert.deepEqual(index.folders, []);
  assert.deepEqual(index.notes, []);
});
