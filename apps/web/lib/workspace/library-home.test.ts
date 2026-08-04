import assert from "node:assert/strict";
import { test } from "node:test";

import { isHomeNote, pickLibraryLandingNote } from "./library-home";
import type { CloudLibraryNote } from "./library-tree";

function note(path: string, updatedAt = ""): CloudLibraryNote {
  return { id: path, path, title: path, content: "", createdAt: "", updatedAt };
}

test("isHomeNote matches Home in any case, with or without .md, in any folder", () => {
  assert.equal(isHomeNote(note("Home.md")), true);
  assert.equal(isHomeNote(note("home")), true);
  assert.equal(isHomeNote(note("HOME.MD")), true);
  assert.equal(isHomeNote(note("Personal/Home.md")), true);
  assert.equal(isHomeNote(note("Homework.md")), false);
  assert.equal(isHomeNote(note("Contract law/Offer.md")), false);
});

test("a note named Home wins the landing spot regardless of recency", () => {
  const notes = [note("Torts/Duty.md", "2026-08-03T10:00:00Z"), note("Home.md", "2026-01-01T00:00:00Z")];
  assert.equal(pickLibraryLandingNote(notes)?.path, "Home.md");
});

test("without a Home note the most recently edited note lands", () => {
  const notes = [
    note("Statics/Trusses.md", "2026-08-01T09:00:00Z"),
    note("Statics/Beams.md", "2026-08-03T09:00:00Z"),
    note("Art history/Baroque.md", "2026-07-20T09:00:00Z"),
  ];
  assert.equal(pickLibraryLandingNote(notes)?.path, "Statics/Beams.md");
});

test("blank updatedAt (preview fixtures) falls back to the first note", () => {
  const notes = [note("First.md"), note("Second.md")];
  assert.equal(pickLibraryLandingNote(notes)?.path, "First.md");
});

test("an empty library has no landing note", () => {
  assert.equal(pickLibraryLandingNote([]), null);
});
